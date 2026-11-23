import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { configureApiDocs } from '../src/docs/configure-api-docs';
import { DatabaseService } from '../src/database/database.service';
import type { GymSessionView } from '../src/gym/gym.types';
import { canonicalGymSession } from '../src/gym/canonical-activities.controller';

const body = {
  started_at: '2026-11-24T18:00:00+01:00',
  duration_minutes: 60,
  training_mode: 'push',
  accompanied: false,
};
describe('Sport gym API (PostgreSQL)', () => {
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
    const result = await db.query<{ id: string }>(
      `INSERT INTO sport.accounts(name,token_hash) VALUES ('Test owner',$1),('Other owner',$2) RETURNING id`,
      [
        createHash('sha256').update(token).digest('hex'),
        createHash('sha256').update(otherToken).digest('hex'),
      ],
    );
    owner = result.rows[0].id;
    other = result.rows[1].id;
  });
  afterEach(async () => {
    await db.query(
      'DELETE FROM sport.gym_sessions WHERE account_id IN ($1,$2)',
      [owner, other],
    );
    await db.query('DELETE FROM sport.accounts WHERE id IN ($1,$2)', [
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
  async function create(): Promise<GymSessionView> {
    const response = await api('post', '/api/v1/gym-sessions')
      .send(body)
      .expect(201);
    return response.body as GymSessionView;
  }

  it('creates, updates without changing identity, cancels and retires idempotently while retaining export history', async () => {
    const session = await create();
    expect(session).toMatchObject({
      title: 'Gimnasio · Push',
      started_at: '2026-11-24T17:00:00.000Z',
      end_at: '2026-11-24T18:00:00.000Z',
      status: 'scheduled',
    });
    expect(session).not.toHaveProperty('account_id');
    const canonical = await api('get', '/api/v1/activities/export').expect(200);
    expect(canonical.body as unknown).toEqual([canonicalGymSession(session)]);
    const same = await api('patch', `/api/v1/gym-sessions/${session.id}`)
      .send(body)
      .expect(200);
    expect((same.body as GymSessionView).updated_at).toBe(session.updated_at);
    const changed = await api('patch', `/api/v1/gym-sessions/${session.id}`)
      .send({
        duration_minutes: 90,
        training_mode: 'leg',
        accompanied: true,
        status: 'cancelled',
      })
      .expect(200);
    expect(changed.body as GymSessionView).toMatchObject({
      id: session.id,
      title: 'Gimnasio · Leg',
      end_at: '2026-11-24T18:30:00.000Z',
      accompanied: true,
      status: 'cancelled',
    });
    expect(
      (await api('get', '/api/v1/gym-sessions').expect(200))
        .body as GymSessionView[],
    ).toHaveLength(1);
    await api('delete', `/api/v1/gym-sessions/${session.id}`).expect(204);
    const exported = await api('get', '/api/v1/gym-sessions/export').expect(
      200,
    );
    const retired = (exported.body as GymSessionView[])[0];
    expect(retired.deleted_at).not.toBeNull();
    const canonicalRetired = await api(
      'get',
      '/api/v1/activities/export',
    ).expect(200);
    expect(canonicalRetired.body as unknown).toEqual([
      canonicalGymSession(retired),
    ]);
    await api('delete', `/api/v1/gym-sessions/${session.id}`).expect(204);
    const again = await api('get', '/api/v1/gym-sessions/export').expect(200);
    expect((again.body as GymSessionView[])[0].deleted_at).toBe(
      retired.deleted_at,
    );
    expect(
      (await api('get', '/api/v1/gym-sessions').expect(200))
        .body as GymSessionView[],
    ).toEqual([]);
    await api('get', `/api/v1/gym-sessions/${session.id}`).expect(404);
  });

  it('does not disclose or modify another account and rejects missing or disabled credentials', async () => {
    const session = await create();
    await request(app.getHttpServer()).get('/api/v1/gym-sessions').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/activities/export')
      .expect(401);
    const foreignExport = await api(
      'get',
      '/api/v1/activities/export',
      otherToken,
    ).expect(200);
    expect(foreignExport.body as unknown).toEqual([]);
    expect(
      (await api('get', '/api/v1/gym-sessions', otherToken).expect(200))
        .body as GymSessionView[],
    ).toEqual([]);
    expect(
      (await api('get', '/api/v1/gym-sessions/export', otherToken).expect(200))
        .body as GymSessionView[],
    ).toEqual([]);
    await api('get', `/api/v1/gym-sessions/${session.id}`, otherToken).expect(
      404,
    );
    await api('patch', `/api/v1/gym-sessions/${session.id}`, otherToken)
      .send({ status: 'completed' })
      .expect(404);
    await api(
      'delete',
      `/api/v1/gym-sessions/${session.id}`,
      otherToken,
    ).expect(404);
    await db.query('UPDATE sport.accounts SET enabled=false WHERE id=$1', [
      owner,
    ]);
    await api('get', '/api/v1/gym-sessions').expect(401);
    await api('get', '/api/v1/activities/export').expect(401);
  });

  it('enforces body validation and the database interval boundary and serves the public contract', async () => {
    const session = await create();
    await api('patch', `/api/v1/gym-sessions/${session.id}`)
      .send({})
      .expect(422);
    await api('post', '/api/v1/gym-sessions')
      .send({ ...body, account_id: other })
      .expect(422);
    await api('post', '/api/v1/gym-sessions')
      .send({ ...body, duration_minutes: '60' })
      .expect(422);
    await api('post', '/api/v1/gym-sessions')
      .send({
        ...body,
        started_at: '9999-12-31T23:59:00Z',
        duration_minutes: 2,
      })
      .expect(422);
    await api('patch', `/api/v1/gym-sessions/${session.id}`)
      .send({ duration_minutes: null })
      .expect(422);
    await api('get', '/api/v1/gym-sessions?limit=51').expect(422);
    await api('get', '/api/v1/gym-sessions/not-a-uuid').expect(422);
    const spec = await request(app.getHttpServer())
      .get('/api/docs/openapi.json')
      .expect(200);
    expect(spec.body as { paths: object }).toHaveProperty(
      'paths./api/v1/gym-sessions',
    );
  });
});
