import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { ConnectionsService } from '../src/connections/connections.service';
import { DatabaseService } from '../src/database/database.service';
import { CredentialsService } from '../src/credentials/credentials.service';

describe('Connections (HTTP)', () => {
  const cookie = `__Host-synkron_session=${'a'.repeat(64)}`;
  const settings = {
    AUTH_API_INTERNAL_URL: 'http://api:3003',
    SYNC_AUTH_SERVICE_TOKEN: 'b'.repeat(64),
    SESSION_COOKIE_NAME: '__Host-synkron_session',
  };
  let app: INestApplication<App>;
  let owner: string;
  let otherOwner: string;
  let previousSettings: Map<string, string | undefined>;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let listSpy: jest.SpiedFunction<ConnectionsService['list']>;

  beforeEach(async () => {
    owner = randomUUID();
    otherOwner = randomUUID();
    previousSettings = new Map();
    for (const [name, value] of Object.entries(settings)) {
      previousSettings.set(name, process.env[name]);
      process.env[name] = value;
    }

    // Se simula solo la llamada HTTP a la API; guard, cliente y PostgreSQL son reales.
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        Response.json({
          tenant_id: owner,
          expires_at: new Date(Date.now() + 60000).toISOString(),
        }),
      ),
    );

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();

    listSpy = jest.spyOn(app.get(ConnectionsService), 'list');
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
        listSpy?.mockRestore();
        fetchMock.mockRestore();
        for (const [name, value] of previousSettings) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    }
  });

  async function seedConnections() {
    const connections = app.get(ConnectionsService);
    const own = await connections.createWithoutAuth(owner, {
      name: 'Own connection',
      base_url: 'https://own.example.com',
    });
    await connections.createWithoutAuth(otherOwner, {
      name: 'Other connection',
      base_url: 'https://other.example.com',
    });
    return own;
  }

  it('rejects missing session cookies before querying connections', async () => {
    await request(app.getHttpServer()).get('/api/v1/connections').expect(401);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('rejects sessions invalidated by the API before querying connections', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Cookie', cookie)
      .expect(401);

    expect(listSpy).not.toHaveBeenCalled();
  });

  it('returns 503 when session verification is unavailable without listing data', async () => {
    fetchMock.mockRejectedValue(new Error('API unavailable'));

    await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Cookie', cookie)
      .expect(503);

    expect(listSpy).not.toHaveBeenCalled();
  });

  it('lists only the verified owner connections without exposing credentials', async () => {
    const own = await seedConnections();

    const response = await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Cookie', cookie)
      .expect(200)
      .expect('Cache-Control', 'no-store');

    const body = response.body as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: own.id,
      name: 'Own connection',
      has_credentials: false,
    });
    expect(body[0]).not.toHaveProperty('credentials_encrypted');
    expect(body[0]).not.toHaveProperty('tenant_id');
  });

  it('uses the verified owner even when another owner is supplied in a header', async () => {
    const own = await seedConnections();

    const response = await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('X-Tenant-ID', otherOwner)
      .set('Cookie', cookie)
      .expect(200);

    const body = response.body as { id: string }[];
    expect(body.map((connection) => connection.id)).toEqual([own.id]);
    expect(listSpy).toHaveBeenCalledWith(owner, 20, 0);
  });

  it('paginates only the owner connections with deterministic ordering for equal timestamps', async () => {
    const connections = app.get(ConnectionsService);
    const ids: string[] = [];
    for (let index = 0; index < 5; index++) {
      const connection = await connections.createWithoutAuth(owner, {
        name: `Connection ${index}`,
        base_url: 'https://tasks.example.com',
      });
      ids.push(connection.id);
    }
    await connections.createWithoutAuth(otherOwner, {
      name: 'Other owner',
      base_url: 'https://other.example.com',
    });
    await app.get(DatabaseService).query(
      `UPDATE sync.connections SET created_at = '2026-01-01T00:00:00Z'
       WHERE tenant_id IN ($1, $2)`,
      [owner, otherOwner],
    );

    async function page(offset: number): Promise<string[]> {
      const response = await request(app.getHttpServer())
        .get('/api/v1/connections')
        .query({ limit: 2, offset })
        .set('Cookie', cookie)
        .expect(200)
        .expect('Cache-Control', 'no-store');

      const body = response.body as { id: string }[];
      return body.map((connection) => connection.id);
    }

    const orderedIds = ids.sort().reverse();
    await expect(page(0)).resolves.toEqual(orderedIds.slice(0, 2));
    await expect(page(2)).resolves.toEqual(orderedIds.slice(2, 4));
    await expect(page(4)).resolves.toEqual(orderedIds.slice(4));
    await expect(page(6)).resolves.toEqual([]);
  });

  it('accepts the maximum page size', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/connections')
      .query({ limit: '50', offset: '0' })
      .set('Cookie', cookie)
      .expect(200)
      .expect([]);

    expect(listSpy).toHaveBeenCalledWith(owner, 50, 0);
  });

  it.each([
    { label: 'zero limit', query: { limit: '0' } },
    { label: 'excessive limit', query: { limit: '51' } },
    { label: 'fractional limit', query: { limit: '1.5' } },
    { label: 'non-numeric limit', query: { limit: 'invalid' } },
    { label: 'negative offset', query: { offset: '-1' } },
    { label: 'fractional offset', query: { offset: '0.5' } },
    { label: 'unsafe offset', query: { offset: '9007199254740992' } },
    { label: 'unknown parameter', query: { unexpected: 'value' } },
    {
      label: 'owner query parameter',
      query: { tenant_id: '11111111-1111-4111-8111-111111111111' },
    },
    { label: 'repeated limit', query: { limit: ['1', '2'] } },
  ])('rejects $label before querying connections', async ({ query }) => {
    await request(app.getHttpServer())
      .get('/api/v1/connections')
      .query(query)
      .set('Cookie', cookie)
      .expect(422);

    expect(listSpy).not.toHaveBeenCalled();
  });

  it('creates a connection for the verified owner and lists it', async () => {
    const writeCookies = [
      cookie,
      `__Host-synkron_context=${'c'.repeat(64)}`,
      '__Host-synkron_csrf=csrf-test',
    ].join('; ');

    const response = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Cookie', writeCookies)
      .set('Origin', 'https://synkron.test')
      .set('X-CSRF-Token', 'csrf-test')
      .send({
        name: '  Mis tareas  ',
        base_url: 'https://tasks.example.com',
        auth: { type: 'none' },
      })
      .expect(201)
      .expect('Cache-Control', 'no-store');

    const body = response.body as { id: string };

    expect(body).toMatchObject({
      name: 'Mis tareas',
      base_url: 'https://tasks.example.com',
      auth_type: 'none',
      has_credentials: false,
      enabled: true,
    });
    expect(body).not.toHaveProperty('credentials_encrypted');
    expect(body).not.toHaveProperty('tenant_id');

    const stored = await app.get(DatabaseService).query<{
      tenant_id: string;
      credentials_encrypted: string | null;
    }>(
      `SELECT tenant_id, credentials_encrypted
       FROM sync.connections WHERE id = $1`,
      [body.id],
    );

    expect(stored.rows).toEqual([
      { tenant_id: owner, credentials_encrypted: null },
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Cookie', cookie)
      .expect(200)
      .expect([body]);
  });

  it('creates and lists a Bearer connection without exposing its stored credentials', async () => {
    const token = 'SENSITIVE_TEST_TOKEN.ABC_123-+/==';
    const response = await request(app.getHttpServer())
      .post('/api/v1/connections')
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
      .send({
        name: '  Bearer connection  ',
        base_url: 'https://tasks.example.com',
        auth: { type: 'bearer', token },
      })
      .expect(201)
      .expect('Cache-Control', 'no-store');

    const body = response.body as { id: string };
    expect(body).toMatchObject({
      name: 'Bearer connection',
      auth_type: 'bearer',
      has_credentials: true,
      enabled: true,
    });
    expect(body).not.toHaveProperty('auth');
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('credentials_encrypted');
    expect(JSON.stringify(body)).not.toContain(token);

    const stored = await app.get(DatabaseService).query<{
      tenant_id: string;
      credentials_encrypted: string;
    }>(
      `SELECT tenant_id, credentials_encrypted
       FROM sync.connections WHERE id = $1`,
      [body.id],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].tenant_id).toBe(owner);
    expect(stored.rows[0].credentials_encrypted).toMatch(/^v1\./);
    expect(stored.rows[0].credentials_encrypted).not.toContain(token);
    expect(
      app
        .get(CredentialsService)
        .decrypt(stored.rows[0].credentials_encrypted, owner, body.id),
    ).toBe(token);

    await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Cookie', cookie)
      .expect(200)
      .expect([body]);

    fetchMock.mockResolvedValueOnce(
      Response.json({
        tenant_id: otherOwner,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      }),
    );
    await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Cookie', cookie)
      .expect(200)
      .expect([]);
  });

  it.each([
    { label: 'missing Bearer token', auth: { type: 'bearer' } },
    { label: 'empty Bearer token', auth: { type: 'bearer', token: '' } },
    {
      label: 'whitespace in a Bearer token',
      auth: { type: 'bearer', token: 'SENSITIVE_TEST_TOKEN with-space' },
    },
    {
      label: 'a line break in a Bearer token',
      auth: { type: 'bearer', token: 'SENSITIVE_TEST_TOKEN\r\nInjected:value' },
    },
    {
      label: 'an oversized Bearer token',
      auth: {
        type: 'bearer',
        token: `SENSITIVE_TEST_TOKEN${'a'.repeat(4096)}`,
      },
    },
    {
      label: 'an unknown authentication type',
      auth: { type: 'basic', token: 'SENSITIVE_TEST_TOKEN' },
    },
    {
      label: 'credentials on a connection without authentication',
      auth: { type: 'none', token: 'SENSITIVE_TEST_TOKEN' },
    },
  ])(
    'rejects $label without storing or echoing credentials',
    async ({ auth }) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/connections')
        .set('Cookie', cookie)
        .set('Origin', 'https://synkron.test')
        .set('X-CSRF-Token', 'csrf-test')
        .send({
          name: 'Invalid connection',
          base_url: 'https://tasks.example.com',
          auth,
        })
        .expect(422);

      expect(JSON.stringify(response.body)).not.toContain(
        'SENSITIVE_TEST_TOKEN',
      );
      const stored = await app
        .get(DatabaseService)
        .query('SELECT id FROM sync.connections WHERE tenant_id = $1', [owner]);
      expect(stored.rows).toHaveLength(0);
    },
  );

  it.each([
    {
      label: 'an owner supplied in the body',
      extraOwner: true,
      csrf: 'csrf-test',
      apiStatus: 200,
      expectedStatus: 422,
    },
    {
      label: 'a missing CSRF token',
      extraOwner: false,
      csrf: undefined,
      apiStatus: 200,
      expectedStatus: 403,
    },
    {
      label: 'authorization denied by the API',
      extraOwner: false,
      csrf: 'csrf-test',
      apiStatus: 403,
      expectedStatus: 403,
    },
  ])(
    'rejects $label without storing a connection',
    async ({ extraOwner, csrf, apiStatus, expectedStatus }) => {
      fetchMock.mockResolvedValue(
        apiStatus === 200
          ? Response.json({
              tenant_id: owner,
              expires_at: new Date(Date.now() + 60000).toISOString(),
            })
          : new Response(null, { status: apiStatus }),
      );

      const query = request(app.getHttpServer())
        .post('/api/v1/connections')
        .set('Cookie', cookie)
        .set('Origin', 'https://synkron.test');

      if (csrf !== undefined) query.set('X-CSRF-Token', csrf);

      await query
        .send({
          name: 'Mis tareas',
          base_url: 'https://tasks.example.com',
          auth: { type: 'none' },
          ...(extraOwner ? { tenant_id: otherOwner } : {}),
        })
        .expect(expectedStatus);

      const stored = await app.get(DatabaseService).query(
        `SELECT id FROM sync.connections
         WHERE tenant_id IN ($1, $2)`,
        [owner, otherOwner],
      );

      expect(stored.rows).toHaveLength(0);
    },
  );

  it('returns an empty list for an authenticated owner without connections', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Cookie', cookie)
      .expect(200)
      .expect([]);
  });
});
