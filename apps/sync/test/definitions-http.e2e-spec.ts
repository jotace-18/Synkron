import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { ConnectionsService } from '../src/connections/connections.service';
import { DatabaseService } from '../src/database/database.service';
import { DefinitionsService } from '../src/definitions/definitions.service';

interface DefinitionJson {
  id: string;
  name: string;
  source_connection_id: string;
  connector: string;
  source_collection: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

describe('Definition creation (HTTP, simulated internal authorization API)', () => {
  const route = '/api/v1/sync-definitions';
  const origin = 'https://synkron.test';
  const csrfToken = 'csrf-definition-test';
  const sourceToken = 'definition-source-test-token';
  const cookie = `__Host-synkron_session=${'a'.repeat(64)}`;
  const writeCookies = [
    cookie,
    `__Host-synkron_context=${'c'.repeat(64)}`,
    `__Host-synkron_csrf=${csrfToken}`,
  ].join('; ');
  const settings = {
    AUTH_API_INTERNAL_URL: 'http://api:3003',
    SYNC_AUTH_SERVICE_TOKEN: 'b'.repeat(64),
    SESSION_COOKIE_NAME: '__Host-synkron_session',
  };
  let app: INestApplication<App>;
  let owner: string;
  let otherOwner: string;
  let connectionId: string;
  let authStatus: number;
  let previousSettings: Map<string, string | undefined>;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let createSpy: jest.SpiedFunction<DefinitionsService['create']>;

  beforeEach(async () => {
    owner = randomUUID();
    otherOwner = randomUUID();
    authStatus = 200;
    previousSettings = new Map();
    for (const [name, value] of Object.entries(settings)) {
      previousSettings.set(name, process.env[name]);
      process.env[name] = value;
    }
    // Real guards, session client, validation and PostgreSQL; only the remote API is simulated.
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, options) => {
        const address =
          input instanceof URL
            ? input.href
            : typeof input === 'string'
              ? input
              : input.url;
        if (address !== 'http://api:3003/internal/auth/session') {
          return Promise.reject(
            new Error('Unexpected external request during definition creation'),
          );
        }
        if (authStatus !== 200)
          return Promise.resolve(new Response(null, { status: authStatus }));
        const headers = new Headers(options?.headers);
        if (
          options?.method !== 'POST' ||
          headers.get('Origin') !== origin ||
          headers.get('X-CSRF-Token') !== csrfToken
        ) {
          return Promise.resolve(new Response(null, { status: 403 }));
        }
        return Promise.resolve(
          Response.json({
            tenant_id: owner,
            expires_at: new Date(Date.now() + 60000).toISOString(),
          }),
        );
      });

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    createSpy = jest.spyOn(app.get(DefinitionsService), 'create');
    connectionId = await createBearer(owner);
  });

  afterEach(async () => {
    try {
      if (app) {
        const database = app.get(DatabaseService);
        await database.query(
          'DELETE FROM sync.definitions WHERE tenant_id IN ($1, $2)',
          [owner, otherOwner],
        );
        await database.query(
          'DELETE FROM sync.connections WHERE tenant_id IN ($1, $2)',
          [owner, otherOwner],
        );
      }
    } finally {
      try {
        await app?.close();
      } finally {
        createSpy?.mockRestore();
        fetchMock?.mockRestore();
        for (const [name, value] of previousSettings) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    }
  });

  async function createBearer(tenantId: string): Promise<string> {
    const connection = await app
      .get(ConnectionsService)
      .createWithBearer(tenantId, {
        name: 'Definition HTTP test',
        base_url: 'http://academic:3000/api/v1/assignments/export',
        token: sourceToken,
      });
    return connection.id;
  }

  function body(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      name: '  Centralizar entregas  ',
      source_connection_id: connectionId,
      connector: 'academic.assignments',
      ...overrides,
    };
  }

  function post(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(route)
      .set('Cookie', writeCookies)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken)
      .send(body(overrides));
  }

  async function count(): Promise<number> {
    const result = await app
      .get(DatabaseService)
      .query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM sync.definitions WHERE tenant_id IN ($1, $2)',
        [owner, otherOwner],
      );
    return result.rows[0].count;
  }

  it('creates a definition for the verified owner with normalized data and no secrets in its response', async () => {
    const response = await post()
      .expect(201)
      .expect('Cache-Control', 'no-store');
    const definition = response.body as DefinitionJson;
    expect(Object.keys(definition).sort()).toEqual(
      [
        'id',
        'name',
        'source_connection_id',
        'connector',
        'source_collection',
        'enabled',
        'created_at',
        'updated_at',
      ].sort(),
    );
    expect(definition).toMatchObject({
      name: 'Centralizar entregas',
      source_connection_id: connectionId,
      connector: 'academic.assignments',
      source_collection: 'assignments',
      enabled: true,
    });
    expect(definition.id).toMatch(/^[a-f0-9-]{36}$/i);
    expect(typeof definition.created_at).toBe('string');
    expect(typeof definition.updated_at).toBe('string');
    expect(response.text).not.toContain(sourceToken);
    const stored = await app
      .get(DatabaseService)
      .query<{ tenant_id: string }>(
        'SELECT tenant_id FROM sync.definitions WHERE id = $1',
        [definition.id],
      );
    expect(stored.rows[0].tenant_id).toBe(owner);
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Cookie')).toBe(writeCookies);
    expect(headers.get('X-Synkron-Service-Token')).toBe(
      settings.SYNC_AUTH_SERVICE_TOKEN,
    );
    expect(await count()).toBe(1);
  });

  it('preserves an explicitly disabled definition', async () => {
    const response = await post({ enabled: false }).expect(201);
    expect((response.body as DefinitionJson).enabled).toBe(false);
  });

  it('ignores a forged owner header and uses the verified session owner', async () => {
    await post().set('X-Tenant-ID', otherOwner).expect(201);
    expect(createSpy.mock.calls[0][0]).toBe(owner);
    const stored = await app
      .get(DatabaseService)
      .query<{ tenant_id: string }>(
        'SELECT tenant_id FROM sync.definitions WHERE tenant_id IN ($1, $2)',
        [owner, otherOwner],
      );
    expect(stored.rows).toEqual([{ tenant_id: owner }]);
  });

  it.each([false, true])(
    'returns the same 404 for a nonexistent or foreign connection (foreign: %s)',
    async (foreign) => {
      const source_connection_id = foreign
        ? await createBearer(otherOwner)
        : randomUUID();
      const response = await post({ source_connection_id }).expect(404);
      expect((response.body as { message: string }).message).toBe(
        'Conexión no encontrada',
      );
      expect(await count()).toBe(0);
    },
  );

  it('rejects a disabled source connection with 409 without creating a definition', async () => {
    await app
      .get(DatabaseService)
      .query(
        'UPDATE sync.connections SET enabled = false WHERE tenant_id = $1 AND id = $2',
        [owner, connectionId],
      );
    await post().expect(409);
    expect(await count()).toBe(0);
  });

  it('rejects an incompatible source authentication type with 400', async () => {
    const connection = await app
      .get(ConnectionsService)
      .createWithoutAuth(owner, {
        name: 'No Bearer',
        base_url: 'http://academic:3000/api/v1/assignments/export',
      });
    await post({ source_connection_id: connection.id }).expect(400);
    expect(await count()).toBe(0);
  });

  it('returns a public conflict for a duplicate active definition and keeps only the original', async () => {
    await post().expect(201);
    const duplicate = await post({ name: 'Another name' }).expect(409);
    expect((duplicate.body as { message: string }).message).toBe(
      'Ya existe una definición activa para esta conexión y colección',
    );
    expect(duplicate.text).not.toContain('definitions_active_source_unique');
    expect(await count()).toBe(1);
  });

  it('allows a disabled alternative alongside the active definition', async () => {
    await post().expect(201);
    await post({ enabled: false }).expect(201);
    expect(await count()).toBe(2);
  });

  it('creates one definition and reports one conflict for simultaneous duplicate HTTP requests', async () => {
    const responses = await Promise.all([
      post({ name: 'Concurrent A' }),
      post({ name: 'Concurrent B' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await count()).toBe(1);
  });

  it.each([undefined, '__Host-synkron_session=malformed'])(
    'rejects missing or malformed session cookies before calling the service: %s',
    async (sessionCookie) => {
      const pending = request(app.getHttpServer())
        .post(route)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrfToken);
      if (sessionCookie !== undefined) pending.set('Cookie', sessionCookie);
      await pending.send(body()).expect(401);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
      expect(await count()).toBe(0);
    },
  );

  it('rejects a session invalidated by the API before entering the service', async () => {
    authStatus = 401;
    await post().expect(401);
    expect(createSpy).not.toHaveBeenCalled();
    expect(await count()).toBe(0);
  });

  it('returns 503 without writing when internal session verification is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('Private authorization failure'));
    const response = await post().expect(503);
    expect(response.text).not.toContain('Private authorization failure');
    expect(createSpy).not.toHaveBeenCalled();
    expect(await count()).toBe(0);
  });

  it('rejects a missing origin before asking the internal API', async () => {
    await post().unset('Origin').expect(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing CSRF header before asking the internal API', async () => {
    await post().unset('X-CSRF-Token').expect(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('forwards a disallowed origin and rejects the internal API refusal without writing', async () => {
    await post().set('Origin', 'https://another.example.com').expect(403);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Origin')).toBe(
      'https://another.example.com',
    );
    expect(createSpy).not.toHaveBeenCalled();
    expect(await count()).toBe(0);
  });

  it('forwards an invalid CSRF token and rejects the internal API refusal without writing', async () => {
    await post().set('X-CSRF-Token', 'wrong-token').expect(403);
    expect(
      new Headers(fetchMock.mock.calls[0][1]?.headers).get('X-CSRF-Token'),
    ).toBe('wrong-token');
    expect(createSpy).not.toHaveBeenCalled();
    expect(await count()).toBe(0);
  });

  it('rejects an expired internal verification result instead of using its owner', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ tenant_id: owner, expires_at: '2000-01-01T00:00:00Z' }),
    );
    await post().expect(503);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it.each([
    { name: '  ' },
    { name: 'x'.repeat(101) },
    { source_connection_id: 'invalid-uuid' },
    { connector: 'another.connector' },
    { enabled: 'false' },
    { tenant_id: 'client-selected-owner' },
    { source_collection: 'exams' },
    { token: 'private-client-value' },
    { name: undefined, source_connection_id: undefined, connector: undefined },
  ])(
    'rejects invalid or server-controlled request fields before entering the service: %j',
    async (changes) => {
      const response = await post(changes).expect(422);
      expect(response.text).not.toContain('private-client-value');
      expect(createSpy).not.toHaveBeenCalled();
      expect(await count()).toBe(0);
    },
  );
});
