import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { configureApiDocs } from '../src/docs/configure-api-docs';
import { DatabaseService } from '../src/database/database.service';
import type { EventView } from '../src/events/event.types';
import { canonicalEvent } from '../src/events/canonical-activities.controller';

describe('Personal API (PostgreSQL)', () => {
  let app: INestApplication<App>, db: DatabaseService;
  let owner: string, other: string, token: string, otherToken: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    configureApiDocs(app);
    await app.init();
    db = app.get(DatabaseService);
  });
  beforeEach(async () => {
    token = randomBytes(32).toString('hex');
    otherToken = randomBytes(32).toString('hex');
    const accounts = await db.query<{ id: string }>(
      `INSERT INTO personal.accounts(name,token_hash) VALUES ('Test owner',$1),('Other owner',$2) RETURNING id`,
      [
        createHash('sha256').update(token).digest('hex'),
        createHash('sha256').update(otherToken).digest('hex'),
      ],
    );
    owner = accounts.rows[0].id;
    other = accounts.rows[1].id;
  });
  afterEach(async () => {
    await db.query('DELETE FROM personal.events WHERE account_id IN ($1,$2)', [
      owner,
      other,
    ]);
    await db.query('DELETE FROM personal.accounts WHERE id IN ($1,$2)', [
      owner,
      other,
    ]);
  });
  afterAll(async () => {
    await app?.close();
  });
  function api(
    method: 'post' | 'get' | 'patch' | 'delete',
    path: string,
    credential = token,
  ) {
    return request(app.getHttpServer())
      [method](path)
      .auth(credential, { type: 'bearer' });
  }
  async function create(): Promise<EventView> {
    return (
      await api('post', '/api/v1/events')
        .send({ title: 'Comprar', on_date: '2026-11-25' })
        .expect(201)
    ).body as EventView;
  }

  it('preserves identity through all temporal forms, partial concurrent edits, cancellation and idempotent retirement', async () => {
    const original = await create();
    expect(original).toMatchObject({
      title: 'Comprar',
      on_date: '2026-11-25',
      started_at: null,
      end_at: null,
      duration_minutes: null,
      people: [],
      status: 'pending',
    });
    expect(
      (await api('get', '/api/v1/activities/export').expect(200))
        .body as unknown,
    ).toEqual([canonicalEvent(original)]);
    const patch = `/api/v1/events/${original.id}`;
    const instant = (
      await api('patch', patch)
        .send({ on_date: null, started_at: '2026-11-25T10:00:00+01:00' })
        .expect(200)
    ).body as EventView;
    expect(instant).toMatchObject({
      id: original.id,
      started_at: '2026-11-25T09:00:00.000Z',
      on_date: null,
      end_at: null,
    });
    const interval = (
      await api('patch', patch)
        .send({ duration_minutes: 30, people: [' Ana '] })
        .expect(200)
    ).body as EventView;
    expect(interval).toMatchObject({
      id: original.id,
      end_at: '2026-11-25T09:30:00.000Z',
      people: ['Ana'],
    });
    const same = (
      await api('patch', patch)
        .send({ duration_minutes: 30, people: ['Ana'] })
        .expect(200)
    ).body as EventView;
    expect(same.updated_at).toBe(interval.updated_at);
    await api('patch', patch)
      .send({ on_date: '2026-11-26', started_at: null })
      .expect(422);
    await api('patch', patch).send({ duration_minutes: null }).expect(200);
    const date = (
      await api('patch', patch)
        .send({ on_date: '2026-11-26', started_at: null })
        .expect(200)
    ).body as EventView;
    expect(date).toMatchObject({
      on_date: '2026-11-26',
      started_at: null,
      end_at: null,
      duration_minutes: null,
    });
    await Promise.all([
      api('patch', patch).send({ title: 'Peluquería' }).expect(200),
      api('patch', patch)
        .send({ people: ['Luis'] })
        .expect(200),
    ]);
    const edited = (await api('get', patch).expect(200)).body as EventView;
    expect(edited).toMatchObject({ title: 'Peluquería', people: ['Luis'] });
    await api('patch', patch).send({ status: 'completed' }).expect(200);
    const cancelled = (
      await api('patch', patch).send({ status: 'cancelled' }).expect(200)
    ).body as EventView;
    expect(cancelled.deleted_at).toBeNull();
    expect(
      (await api('get', '/api/v1/events').expect(200)).body as EventView[],
    ).toHaveLength(1);
    await api('delete', patch).expect(204);
    const exported = (await api('get', '/api/v1/events/export').expect(200))
      .body as EventView[];
    expect(exported[0].deleted_at).not.toBeNull();
    expect(
      (await api('get', '/api/v1/activities/export').expect(200))
        .body as unknown,
    ).toEqual([canonicalEvent(exported[0])]);
    await api('delete', patch).expect(204);
    expect(
      (
        (await api('get', '/api/v1/events/export').expect(200))
          .body as EventView[]
      )[0].deleted_at,
    ).toBe(exported[0].deleted_at);
    expect(
      (await api('get', '/api/v1/events').expect(200)).body as unknown,
    ).toEqual([]);
    await api('get', patch).expect(404);
  });
  it('isolates accounts in reads, writes and canonical exports and rejects absent or disabled credentials', async () => {
    const original = await create(),
      path = `/api/v1/events/${original.id}`;
    await request(app.getHttpServer()).get('/api/v1/events').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/activities/export')
      .expect(401);
    for (const route of [
      '/api/v1/events',
      '/api/v1/events/export',
      '/api/v1/activities/export',
    ])
      expect(
        (await api('get', route, otherToken).expect(200)).body as unknown,
      ).toEqual([]);
    await api('get', path, otherToken).expect(404);
    await api('patch', path, otherToken)
      .send({ status: 'completed' })
      .expect(404);
    await api('delete', path, otherToken).expect(404);
    await db.query('UPDATE personal.accounts SET enabled=false WHERE id=$1', [
      owner,
    ]);
    await api('get', '/api/v1/activities/export').expect(401);
  });
  it('rejects incoherent final schedules, unsafe bodies and out-of-range dates at HTTP and database boundaries', async () => {
    const original = await create(),
      path = `/api/v1/events/${original.id}`;
    await api('patch', path).send({}).expect(422);
    for (const fields of [
      { on_date: null },
      { on_date: '2026-02-29' },
      { duration_minutes: 30 },
      { duration_minutes: 0 },
      { started_at: '2026-11-25T10:00:00Z' },
      { on_date: null, started_at: '2026-11-25T10:00:00' },
      { title: null },
      { people: null },
      { people: [' '] },
      { status: null },
      { account_id: other },
      { end_at: '2026-11-25T12:00:00Z' },
      {
        on_date: null,
        started_at: '9999-12-31T23:59:00Z',
        duration_minutes: 2,
      },
    ])
      await api('post', '/api/v1/events')
        .send({ title: 'Cita', on_date: '2026-11-25', ...fields })
        .expect(422);
    await api('get', '/api/v1/activities/export?limit=51').expect(422);
    await api('get', '/api/v1/events/not-a-uuid').expect(422);
    await expect(
      db.query(
        `INSERT INTO personal.events(account_id,title,on_date,duration_minutes) VALUES($1,'bad','2026-11-25',30)`,
        [owner],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'events_schedule_valid',
    });
    await expect(
      db.query(
        `INSERT INTO personal.events(account_id,title,on_date,people) VALUES($1,'bad','2026-11-25',ARRAY[''])`,
        [owner],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'events_people_valid',
    });
    const spec = await request(app.getHttpServer())
      .get('/api/docs/openapi.json')
      .expect(200);
    expect(spec.body as { paths: object }).toHaveProperty(
      'paths./api/v1/activities/export',
    );
    await request(app.getHttpServer()).get('/healthz').expect(200);
  });
});
