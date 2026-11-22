import type { INestApplication } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { configureApiDocs } from '../src/ingestions/configure-api-docs';
import { DatabaseService } from '../src/database/database.service';
import { SessionClientService } from '../src/session-client/session-client.service';
import { RunProcessorService } from '../src/runs/run-processor.service';
import { RunsService } from '../src/runs/runs.service';
import type {
  IngestionReceipt,
  IngestionResult,
} from '../src/ingestions/ingestion.types';
import type { IngestionSourceView } from '../src/ingestions/ingestion-source.types';
import { ingestionExample } from '../src/ingestions/ingestion-openapi';
import { AcademicReaderService } from '../src/connectors/academic/academic-reader.service';
import { AcademicExamsReaderService } from '../src/connectors/academic/academic-exams-reader.service';

type Credential = { source: IngestionSourceView; token: string };
describe('Standardized ingestion (HTTP, PostgreSQL and worker)', () => {
  let app: INestApplication<App>,
    db: DatabaseService,
    runs: RunsService,
    processor: RunProcessorService;
  let owner: string, other: string;
  const origin = 'https://synkron.test',
    csrf = 'ingestion-test-csrf';
  const readAll = jest
    .fn()
    .mockRejectedValue(
      new Error('A direct ingestion must not read an external API'),
    );
  const session = (cookie?: string) => {
    if (cookie === 'owner')
      return { tenant_id: owner, expires_at: '2099-01-01T00:00:00Z' };
    if (cookie === 'other')
      return { tenant_id: other, expires_at: '2099-01-01T00:00:00Z' };
    throw new UnauthorizedException();
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SessionClientService)
      .useValue({
        getSession: (cookie?: string) => Promise.resolve(session(cookie)),
        authorizeWrite: (
          cookie?: string,
          receivedOrigin?: string,
          receivedCsrf?: string,
        ) => {
          if (receivedOrigin !== origin || receivedCsrf !== csrf)
            throw new ForbiddenException();
          return Promise.resolve(session(cookie));
        },
      })
      .overrideProvider(AcademicReaderService)
      .useValue({ readAll })
      .overrideProvider(AcademicExamsReaderService)
      .useValue({ readAll })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    configureApiDocs(app);
    await app.init();
    db = app.get(DatabaseService);
    runs = app.get(RunsService);
    processor = app.get(RunProcessorService);
  });
  beforeEach(() => {
    owner = randomUUID();
    other = randomUUID();
    readAll.mockClear();
  });
  afterEach(async () => {
    for (const table of [
      'event_outbox',
      'runs',
      'ingestion_sources',
      'activities',
      'definitions',
      'connections',
    ])
      await db.query(`DELETE FROM sync.${table} WHERE tenant_id IN ($1,$2)`, [
        owner,
        other,
      ]);
  });
  afterAll(async () => {
    await app?.close();
  });
  function admin(method: 'post' | 'put', path: string, cookie = 'owner') {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf);
  }
  async function createSource(cookie = 'owner'): Promise<Credential> {
    const response = await admin('post', '/api/v1/ingestion-sources', cookie)
      .send({
        name: 'External exams',
        source_collection: 'external-exams',
        allowed_types: ['academic.exam'],
      })
      .expect(201);
    return response.body as Credential;
  }
  function send(token: string, key: string, body: unknown = ingestionExample) {
    return request(app.getHttpServer())
      .post('/api/v1/ingestions')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send(body as object);
  }
  async function execute(id: string) {
    const claim = await runs.claimQueued(owner, id);
    expect(claim?.connector).toBe('standard.ingestion');
    await processor.process(claim!);
  }
  async function result(token: string, id: string): Promise<IngestionResult> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/ingestions/${id}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    return response.body as IngestionResult;
  }

  it('persists before accepting, survives retries, processes from the stored body and emits normal changes and results', async () => {
    const credential = await createSource();
    expect(credential.token).toMatch(/^si_[a-f0-9]{64}$/);
    const sourceList = await request(app.getHttpServer())
      .get('/api/v1/ingestion-sources')
      .set('Cookie', 'owner')
      .expect(200);
    expect(JSON.stringify(sourceList.body)).not.toContain(credential.token);
    expect(JSON.stringify(sourceList.body)).not.toContain('token_hash');
    const definitions = await request(app.getHttpServer())
      .get('/api/v1/sync-definitions')
      .set('Cookie', 'owner')
      .expect(200);
    expect(definitions.body as unknown[]).toHaveLength(0);
    const accepted = await send(credential.token, 'create-1').expect(202);
    const receipt = accepted.body as IngestionReceipt;
    expect(accepted.headers.location).toBe(`/api/v1/ingestions/${receipt.id}`);
    const pending = await db.query<{ count: string }>(
      'SELECT count(*) FROM sync.run_jobs WHERE run_id=$1',
      [receipt.id],
    );
    expect(pending.rows[0].count).toBe('1');
    const retry = await send(credential.token, 'create-1').expect(202);
    expect((retry.body as IngestionReceipt).id).toBe(receipt.id);
    await execute(receipt.id);
    expect((await result(credential.token, receipt.id)).counts.created).toBe(1);
    const initial = await db.query<{ id: string }>(
      'SELECT id FROM sync.activities WHERE tenant_id=$1',
      [owner],
    );
    const repeated = await send(credential.token, 'create-2').expect(202);
    await execute((repeated.body as IngestionReceipt).id);
    expect(
      (await result(credential.token, (repeated.body as IngestionReceipt).id))
        .counts.unchanged,
    ).toBe(1);
    const changed = {
      ...ingestionExample,
      activity: {
        ...ingestionExample.activity,
        details: { ...ingestionExample.activity.details, grade: 8.5 },
      },
    };
    const update = await send(credential.token, 'update-1', changed).expect(
      202,
    );
    await execute((update.body as IngestionReceipt).id);
    expect(
      (await result(credential.token, (update.body as IngestionReceipt).id))
        .counts.updated,
    ).toBe(1);
    const stored = await db.query<{ id: string }>(
      'SELECT id FROM sync.activities WHERE tenant_id=$1',
      [owner],
    );
    expect(stored.rows[0].id).toBe(initial.rows[0].id);
    const retirement = await send(credential.token, 'retire-1', {
      schema_version: 1,
      action: 'retire',
      external_id: ingestionExample.external_id,
      source_updated_at: null,
      source_deleted_at: '2026-12-02T12:00:00Z',
    }).expect(202);
    await execute((retirement.body as IngestionReceipt).id);
    expect(
      (await result(credential.token, (retirement.body as IngestionReceipt).id))
        .counts.retired,
    ).toBe(1);
    const events = await db.query<{ count: string }>(
      `SELECT count(*) FROM sync.event_outbox WHERE tenant_id=$1 AND event_type='data.changed'`,
      [owner],
    );
    expect(events.rows[0].count).toBe('3');
    expect(readAll).not.toHaveBeenCalled();
  });

  it('isolates credentials and owners, preserves idempotency after rotation and processes accepted work after revocation', async () => {
    const a = await createSource(),
      b = await createSource('other');
    const accepted = await send(a.token, 'stable-key').expect(202);
    const receipt = accepted.body as IngestionReceipt;
    await request(app.getHttpServer())
      .get(`/api/v1/ingestions/${receipt.id}`)
      .auth(b.token, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/ingestions')
      .set('Cookie', 'owner')
      .set('Idempotency-Key', 'cookie-only')
      .send(ingestionExample)
      .expect(401);
    await admin('put', `/api/v1/ingestion-sources/${a.source.id}`, 'other')
      .send({ enabled: false })
      .expect(404);
    await send(a.token, 'stable-key', {
      ...ingestionExample,
      external_id: 'different',
    }).expect(409);
    await admin('put', `/api/v1/ingestion-sources/${a.source.id}`)
      .send({ enabled: false })
      .expect(200);
    await send(a.token, 'blocked-new').expect(409);
    expect(
      ((await send(a.token, 'stable-key').expect(202)).body as IngestionReceipt)
        .id,
    ).toBe(receipt.id);
    const rotated = await admin(
      'post',
      `/api/v1/ingestion-sources/${a.source.id}/rotate-token`,
    )
      .send({})
      .expect(200);
    const next = rotated.body as Credential;
    await send(a.token, 'stable-key').expect(401);
    expect(
      (
        (await send(next.token, 'stable-key').expect(202))
          .body as IngestionReceipt
      ).id,
    ).toBe(receipt.id);
    await admin('post', `/api/v1/ingestion-sources/${a.source.id}/revoke`)
      .send({})
      .expect(200);
    await send(next.token, 'stable-key').expect(401);
    await execute(receipt.id);
    expect((await runs.get(owner, receipt.id)).status).toBe('completed');
  });

  it('deduplicates concurrent requests, rejects invalid or oversized bodies and rolls back acceptance when its job cannot be stored', async () => {
    const credential = await createSource();
    const simultaneous = await Promise.all([
      send(credential.token, 'concurrent'),
      send(credential.token, 'concurrent'),
    ]);
    expect(simultaneous.map((r) => r.status)).toEqual([202, 202]);
    expect((simultaneous[0].body as IngestionReceipt).id).toBe(
      (simultaneous[1].body as IngestionReceipt).id,
    );
    await send(credential.token, 'invalid-owner', {
      ...ingestionExample,
      tenant_id: other,
    }).expect(422);
    await send(credential.token, 'invalid-state', {
      ...ingestionExample,
      activity: { ...ingestionExample.activity, status: 'pending' },
    }).expect(422);
    await request(app.getHttpServer())
      .post('/api/v1/ingestions')
      .auth(credential.token, { type: 'bearer' })
      .set('Idempotency-Key', 'bad-json')
      .set('Content-Type', 'application/json')
      .send('{broken')
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/ingestions')
      .set('Content-Type', 'text/plain')
      .send('hello')
      .expect(415);
    await request(app.getHttpServer())
      .post('/api/v1/ingestions')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send('{}')
      .expect(415);
    await send(credential.token, 'too-large', {
      ...ingestionExample,
      activity: { ...ingestionExample.activity, title: 'x'.repeat(66000) },
    }).expect(413);
    const before = await db.query<{ count: string }>(
      'SELECT count(*) FROM sync.runs WHERE tenant_id=$1',
      [owner],
    );
    expect(before.rows[0].count).toBe('1');
    const suffix = owner.replaceAll('-', '');
    const fn = `fail_ingestion_${suffix}`,
      trigger = `reject_ingestion_${suffix}`;
    await db.query(
      `CREATE FUNCTION sync.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='${owner}'::uuid THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$`,
    );
    try {
      await db.query(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON sync.run_jobs FOR EACH ROW EXECUTE FUNCTION sync.${fn}()`,
      );
      await send(credential.token, 'rollback-key').expect(503);
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${trigger} ON sync.run_jobs`);
      await db.query(`DROP FUNCTION sync.${fn}()`);
    }
    const after = await db.query<{ count: string }>(
      'SELECT count(*) FROM sync.runs WHERE tenant_id=$1',
      [owner],
    );
    expect(after.rows[0].count).toBe('1');
    await send(credential.token, 'rollback-key').expect(202);
    const spec = await request(app.getHttpServer())
      .get('/api/docs/openapi.json')
      .expect(200);
    expect((spec.body as { openapi: string }).openapi).toBe('3.0.4');
    await request(app.getHttpServer())
      .get('/api/docs')
      .expect('Content-Type', /text\/html/)
      .expect(/swagger-ui-bundle\.js/)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/docs/swagger-ui-init.js')
      .expect('Content-Type', /javascript/)
      .expect(/swaggerRequestInterceptor/)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/docs/swagger-ui-bundle.js')
      .expect('Content-Type', /javascript/)
      .expect(200);
  });
});
