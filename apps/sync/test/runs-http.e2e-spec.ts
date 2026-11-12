import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';

interface RunResponse {
  id: string;
  status: string;
}

describe('Run acceptance and lookup (HTTP and PostgreSQL)', () => {
  const origin = 'https://synkron.test';
  const csrf = 'run-request-csrf';
  const cookie = `__Host-synkron_session=${'a'.repeat(64)}`;
  const settings = {
    AUTH_API_INTERNAL_URL: 'http://api:3003',
    SYNC_AUTH_SERVICE_TOKEN: 'b'.repeat(64),
    SESSION_COOKIE_NAME: '__Host-synkron_session',
  };
  let previousSettings: Map<string, string | undefined>;
  let app: INestApplication<App>;
  let database: DatabaseService;
  let owner: string;
  let sessionOwner: string;
  let definitionId: string;
  let authStatus: number;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(async () => {
    owner = randomUUID();
    sessionOwner = owner;
    authStatus = 200;
    previousSettings = new Map();
    for (const [name, value] of Object.entries(settings)) {
      previousSettings.set(name, process.env[name]);
      process.env[name] = value;
    }
    // Only the remote authorization API is simulated. Guards, validation,
    // transactions, idempotency and persistence use their real implementations.
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
            new Error('No source calls are allowed during acceptance'),
          );
        }
        const headers = new Headers(options?.headers);
        if (authStatus !== 200)
          return Promise.resolve(new Response(null, { status: authStatus }));
        if (
          options?.method === 'POST' &&
          (headers.get('Origin') !== origin ||
            headers.get('X-CSRF-Token') !== csrf)
        ) {
          return Promise.resolve(new Response(null, { status: 403 }));
        }
        return Promise.resolve(
          Response.json({
            tenant_id: sessionOwner,
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
    database = app.get(DatabaseService);
    const connection = await database.query<{ id: string }>(
      `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type, credentials_encrypted)
       VALUES ($1, 'Run HTTP test', 'http://academic:3000/api/v1/assignments/export', 'bearer', 'private-placeholder') RETURNING id`,
      [owner],
    );
    const definition = await database.query<{ id: string }>(
      `INSERT INTO sync.definitions (tenant_id, source_connection_id, name, connector, source_collection)
       VALUES ($1, $2, 'Run HTTP test', 'academic.assignments', 'assignments') RETURNING id`,
      [owner, connection.rows[0].id],
    );
    definitionId = definition.rows[0].id;
  });

  afterEach(async () => {
    try {
      if (database) {
        await database.query('DELETE FROM sync.runs WHERE tenant_id = $1', [
          owner,
        ]);
        await database.query(
          'DELETE FROM sync.definitions WHERE tenant_id = $1',
          [owner],
        );
        await database.query(
          'DELETE FROM sync.connections WHERE tenant_id = $1',
          [owner],
        );
      }
    } finally {
      await app?.close();
      fetchMock?.mockRestore();
      for (const [name, value] of previousSettings) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  function post(id = definitionId, body: object = {}) {
    return request(app.getHttpServer())
      .post(`/api/v1/sync-definitions/${id}/runs`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', 'request-001')
      .send(body);
  }
  function get(id: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/sync-runs/${id}`)
      .set('Cookie', cookie);
  }

  it('returns 202 with Location only after a run and pending job are stored, without contacting the source', async () => {
    const accepted = await post()
      .expect(202)
      .expect('Cache-Control', 'no-store');
    const run = accepted.body as RunResponse;
    expect(run.status).toBe('queued');
    expect(Object.keys(run).sort()).toEqual(['id', 'status']);
    expect(accepted.headers.location).toBe(`/api/v1/sync-runs/${run.id}`);
    const jobs = await database.query(
      'SELECT run_id, published_at FROM sync.run_jobs WHERE tenant_id = $1',
      [owner],
    );
    expect(jobs.rows).toEqual([{ run_id: run.id, published_at: null }]);
    const detail = await get(run.id)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(detail.body as unknown).toMatchObject({
      id: run.id,
      definition_id: definitionId,
      status: 'queued',
      read_count: 0,
      error_code: null,
    });
    for (const secret of [
      'tenant_id',
      'request_key_hash',
      'request_fingerprint',
      'private-placeholder',
      'source_connection_id',
    ]) {
      expect(detail.text).not.toContain(secret);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, options]) => options?.method)).toEqual([
      'POST',
      'GET',
    ]);
  });

  it('returns the same execution and Location for parallel HTTP retries', async () => {
    const results = await Promise.all([post(), post(), post()]);
    expect(results.map((result) => result.status)).toEqual([202, 202, 202]);
    expect(
      new Set(results.map((result) => (result.body as RunResponse).id)).size,
    ).toBe(1);
    expect(new Set(results.map((result) => result.headers.location)).size).toBe(
      1,
    );
  });

  it('returns 409 when the same key targets a different definition', async () => {
    await post().expect(202);
    await post(randomUUID()).expect(409);
  });

  it('uses the session account and rejects a foreign run with the same 404 as an absent run', async () => {
    const accepted = await post().set('X-Tenant-ID', randomUUID()).expect(202);
    const id = (accepted.body as RunResponse).id;
    await get(id).expect(200);
    sessionOwner = randomUUID();
    const foreign = await get(id).expect(404);
    const absent = await get(randomUUID()).expect(404);
    expect(foreign.body as unknown).toEqual(absent.body as unknown);
    await post().expect(404);
  });

  it.each([undefined, '', 'bad key', 'x'.repeat(129), 'a,b'])(
    'rejects missing or invalid idempotency key %s without creating work',
    async (key) => {
      const pending = post();
      if (key === undefined) pending.unset('Idempotency-Key');
      else pending.set('Idempotency-Key', key);
      await pending.expect(422);
      expect(
        (
          await database.query(
            'SELECT id FROM sync.runs WHERE tenant_id = $1',
            [owner],
          )
        ).rows,
      ).toEqual([]);
    },
  );

  it.each([
    { tenant_id: 'forged' },
    { force: true },
    [],
    { token: 'private-value' },
  ])('rejects unsupported request content %j', async (body) => {
    await post(definitionId, body).expect(422);
    expect(
      (
        await database.query('SELECT id FROM sync.runs WHERE tenant_id = $1', [
          owner,
        ])
      ).rows,
    ).toEqual([]);
  });

  it('rejects malformed resource IDs with 422', async () => {
    await post('invalid').expect(422);
    await get('invalid').expect(422);
  });

  it('rejects a missing session for either route', async () => {
    await post().unset('Cookie').expect(401);
    await get(randomUUID()).unset('Cookie').expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalidated session for either route', async () => {
    authStatus = 401;
    await post().expect(401);
    await get(randomUUID()).expect(401);
  });

  it.each(['Origin', 'X-CSRF-Token'])(
    'requires %s for a write even with a valid idempotency key',
    async (header) => {
      await post().unset(header).expect(403);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['Origin', 'X-CSRF-Token'])(
    'rejects invalid %s through the central authorization API',
    async (header) => {
      await post().set(header, 'incorrect').expect(403);
    },
  );

  it('does not accept a request when authorization cannot be checked', async () => {
    fetchMock.mockRejectedValue(new Error('private-auth-failure'));
    const failure = await post().expect(503);
    expect(failure.text).not.toContain('private-auth-failure');
    expect(
      (
        await database.query('SELECT id FROM sync.runs WHERE tenant_id = $1', [
          owner,
        ])
      ).rows,
    ).toEqual([]);
  });
});
