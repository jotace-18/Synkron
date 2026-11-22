import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { ConnectionsService } from '../src/connections/connections.service';
import { DatabaseService } from '../src/database/database.service';

describe('Connection probing (HTTP)', () => {
  const token = 'token-ficticio-de-pruebas';
  const cookie = `__Host-synkron_session=${'a'.repeat(64)}`;
  const target = 'http://task-api:3000/tasks';
  const settings = {
    AUTH_API_INTERNAL_URL: 'http://api:3003',
    SYNC_AUTH_SERVICE_TOKEN: 'b'.repeat(64),
    SESSION_COOKIE_NAME: '__Host-synkron_session',
    SYNC_ALLOWED_CONNECTION_ORIGINS: 'http://task-api:3000',
  };
  let app: INestApplication<App>;
  let owner: string;
  let otherOwner: string;
  let authStatus: number;
  let targetResponse: () => Response | Promise<Response>;
  let targetCalls: { url: string; options: RequestInit | undefined }[];
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let previousSettings: Map<string, string | undefined>;

  beforeEach(async () => {
    owner = randomUUID();
    otherOwner = randomUUID();
    authStatus = 200;
    targetCalls = [];
    targetResponse = () => Response.json({ private: token, items: [] });
    previousSettings = new Map();
    for (const [name, value] of Object.entries(settings)) {
      previousSettings.set(name, process.env[name]);
      process.env[name] = value;
    }

    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, options) => {
        const url =
          input instanceof URL
            ? input.href
            : typeof input === 'string'
              ? input
              : input.url;

        if (url === 'http://api:3003/internal/auth/session') {
          return Promise.resolve(
            authStatus === 200
              ? Response.json({
                  tenant_id: owner,
                  expires_at: new Date(Date.now() + 60000).toISOString(),
                })
              : new Response(null, { status: authStatus }),
          );
        }
        if (url === target) {
          targetCalls.push({ url, options });
          return Promise.resolve().then(() => targetResponse());
        }

        return Promise.reject(new Error('Unexpected HTTP destination'));
      });

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    try {
      if (app) {
        await app
          .get(DatabaseService)
          .query('DELETE FROM sync.connections WHERE tenant_id IN ($1, $2)', [
            owner,
            otherOwner,
          ]);
      }
    } finally {
      try {
        await app?.close();
      } finally {
        fetchMock.mockRestore();
        for (const [name, value] of previousSettings) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    }
  });

  function probeRequest(id: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/connections/${id}/test`)
      .set(
        'Cookie',
        [
          cookie,
          `__Host-synkron_context=${'c'.repeat(64)}`,
          '__Host-synkron_csrf=csrf-test',
        ].join('; '),
      )
      .set('Origin', 'https://synkron.test')
      .set('X-CSRF-Token', 'csrf-test')
      .send({});
  }

  function createBearer(tenantId = owner) {
    return app.get(ConnectionsService).createWithBearer(tenantId, {
      name: 'Probe connection',
      base_url: target,
      token,
    });
  }

  it('decrypts the owned connection and returns only the probe result', async () => {
    const connection = await createBearer();

    await probeRequest(connection.id)
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect({ ok: true, status_code: 200, error: null });

    expect(targetCalls).toHaveLength(1);
    expect(targetCalls[0].url).toBe(target);
    expect(targetCalls[0].options?.headers).toEqual({
      Authorization: `Bearer ${token}`,
    });
    expect(targetCalls[0].options?.redirect).toBe('manual');
  });

  it('reports an external 401 as a completed probe for a connection without credentials', async () => {
    const connection = await app
      .get(ConnectionsService)
      .createWithoutAuth(owner, {
        name: 'No credentials',
        base_url: target,
      });
    targetResponse = () =>
      new Response('Private error details', { status: 401 });

    await probeRequest(connection.id)
      .expect(200)
      .expect({ ok: false, status_code: 401, error: 'http_error' });

    expect(targetCalls).toHaveLength(1);
    expect(targetCalls[0].options?.headers).toEqual({});
  });

  it('returns the same 404 for foreign and nonexistent connections without contacting the target', async () => {
    const foreign = await createBearer(otherOwner);
    const foreignResponse = await probeRequest(foreign.id).expect(404);
    const missingResponse = await probeRequest(randomUUID()).expect(404);

    expect(foreignResponse.body as unknown).toEqual(
      missingResponse.body as unknown,
    );
    expect(targetCalls).toHaveLength(0);
  });

  it('rejects a malformed connection ID before contacting the target', async () => {
    await probeRequest('invalid-id').expect(422);
    expect(targetCalls).toHaveLength(0);
  });

  it('rejects a stored destination outside the allowlist', async () => {
    const connection = await app
      .get(ConnectionsService)
      .createWithBearer(owner, {
        name: 'Forbidden destination',
        base_url: 'http://api:3003/internal/auth/session',
        token,
      });

    await probeRequest(connection.id).expect(403);
    expect(targetCalls).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a redirect without contacting its internal destination', async () => {
    const connection = await createBearer();
    targetResponse = () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'http://api:3003/internal/auth/session' },
      });

    await probeRequest(connection.id)
      .expect(200)
      .expect({ ok: false, status_code: 302, error: 'redirect_not_allowed' });

    expect(targetCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports an oversized external response without returning its contents', async () => {
    const connection = await createBearer();
    targetResponse = () => new Response(new Uint8Array(64 * 1024 + 1));

    await probeRequest(connection.id)
      .expect(200)
      .expect({ ok: false, status_code: 200, error: 'response_too_large' });
  });

  it('reports an external network failure without exception details', async () => {
    const connection = await createBearer();
    targetResponse = () =>
      Promise.reject(new Error(`Private details: ${token}`));

    await probeRequest(connection.id)
      .expect(200)
      .expect({ ok: false, status_code: null, error: 'network_error' });
  });

  it('rejects an unreadable stored credential without contacting the target', async () => {
    const connection = await createBearer();
    await app
      .get(DatabaseService)
      .query(
        'UPDATE sync.connections SET credentials_encrypted = $1 WHERE id = $2 AND tenant_id = $3',
        ['corrupted-credential', connection.id, owner],
      );

    await probeRequest(connection.id).expect(503);
    expect(targetCalls).toHaveLength(0);
  });

  it.each([
    { header: 'Cookie', status: 401 },
    { header: 'X-CSRF-Token', status: 403 },
    { header: 'Origin', status: 403 },
  ])(
    'requires the $header header before contacting the target',
    async ({ header, status }) => {
      const connection = await createBearer();

      await probeRequest(connection.id).unset(header).expect(status);
      expect(targetCalls).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 503])(
    'preserves authorization failure %s without contacting the target',
    async (status) => {
      const connection = await createBearer();
      authStatus = status;

      await probeRequest(connection.id).expect(status);
      expect(targetCalls).toHaveLength(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
