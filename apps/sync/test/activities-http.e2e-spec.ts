import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { ActivitiesService } from '../src/activities/activities.service';
import type { ActivityView } from '../src/activities/activity-view.types';
import { DatabaseService } from '../src/database/database.service';

describe('Activities (HTTP)', () => {
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
  let listSpy: jest.SpiedFunction<ActivitiesService['list']>;
  let getSpy: jest.SpiedFunction<ActivitiesService['get']>;

  beforeEach(async () => {
    owner = randomUUID();
    otherOwner = randomUUID();
    previousSettings = new Map();
    for (const [name, value] of Object.entries(settings)) {
      previousSettings.set(name, process.env[name]);
      process.env[name] = value;
    }
    // Only the HTTP session check is simulated; guards, pipes and PostgreSQL are real.
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        Response.json({
          tenant_id: owner,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }),
      ),
    );
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    listSpy = jest.spyOn(app.get(ActivitiesService), 'list');
    getSpy = jest.spyOn(app.get(ActivitiesService), 'get');
  });

  afterEach(async () => {
    try {
      if (app) {
        const database = app.get(DatabaseService);
        await database.query(
          'DELETE FROM sync.activities WHERE tenant_id IN ($1, $2)',
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
        listSpy?.mockRestore();
        getSpy?.mockRestore();
        fetchMock.mockRestore();
        for (const [name, value] of previousSettings) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    }
  });

  async function seed() {
    const database = app.get(DatabaseService);
    const activities = app.get(ActivitiesService);
    async function create(tenant: string) {
      const connection = await database.query<{ id: string }>(
        `INSERT INTO sync.connections (tenant_id, name, base_url, auth_type)
         VALUES ($1, 'Activity HTTP fixture', 'http://academic:3000', 'none') RETURNING id`,
        [tenant],
      );
      // Internal saves without a lease do not emit events or enqueue jobs.
      const result = await activities.save(tenant, {
        source_connection_id: connection.rows[0].id,
        source_collection: 'assignments',
        external_id: randomUUID(),
        type: 'academic.assignment',
        title: 'HTTP assignment',
        schedule: {
          kind: 'date',
          role: 'deadline',
          date: '2026-11-24',
          at: null,
          end_at: null,
        },
        status: 'pending',
        details: { grade: null },
        source_updated_at: null,
      });
      return { id: result.id, connectionId: connection.rows[0].id };
    }
    const own = await create(owner);
    const foreign = await create(otherOwner);
    const retired = await create(owner);
    await database.query(
      'UPDATE sync.activities SET deleted_at = now() WHERE tenant_id = $1 AND id = $2',
      [owner, retired.id],
    );
    return { own, foreign, retired };
  }

  it('protects both routes with session verification before querying activities', async () => {
    for (const path of [
      '/api/v1/activities',
      `/api/v1/activities/${randomUUID()}`,
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await request(app.getHttpServer())
      .get('/api/v1/activities')
      .set('Cookie', cookie)
      .expect(401);
    expect(listSpy).not.toHaveBeenCalled();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('uses the verified owner and transformed filters, returning the same uncached public view in list and detail', async () => {
    const { own } = await seed();
    const listed = await request(app.getHttpServer())
      .get('/api/v1/activities')
      .query({
        from: '2026-11-01',
        to: '2026-12-01',
        type: 'academic.assignment',
        source_connection_id: own.connectionId,
        limit: '1',
        offset: '0',
        timezone: 'Europe/Madrid',
      })
      .set('Cookie', cookie)
      .set('X-Tenant-ID', otherOwner)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    const rows = listed.body as ActivityView[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(own.id);
    expect(rows[0].schedule).toEqual({
      kind: 'date',
      role: 'deadline',
      date: '2026-11-24',
      at: null,
      end_at: null,
    });
    expect(listSpy).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        limit: 1,
        offset: 0,
        timezone: 'Europe/Madrid',
        from: '2026-11-01',
        to: '2026-12-01',
        type: 'academic.assignment',
        source_connection_id: own.connectionId,
      }),
    );
    await request(app.getHttpServer())
      .get(`/api/v1/activities/${own.id}`)
      .set('Cookie', cookie)
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect(rows[0]);
    expect(getSpy).toHaveBeenCalledWith(owner, own.id);
  });

  it('returns the same 404 for foreign, missing and retired activity IDs', async () => {
    const { foreign, retired } = await seed();
    for (const id of [foreign.id, retired.id, randomUUID()]) {
      await request(app.getHttpServer())
        .get(`/api/v1/activities/${id}`)
        .set('Cookie', cookie)
        .expect(404)
        .expect({
          statusCode: 404,
          message: 'Actividad no encontrada',
          error: 'Not Found',
        });
    }
  });

  it('rejects malformed periods, unnamed timezones, owner overrides and invalid IDs before querying', async () => {
    for (const query of [
      { from: '2026-11-01' },
      { to: '2026-12-01' },
      { from: '2026-02-30', to: '2026-03-02' },
      { from: '2026-12-01', to: '2026-11-01' },
      { timezone: '+01:00' },
      { tenant_id: otherOwner },
    ]) {
      await request(app.getHttpServer())
        .get('/api/v1/activities')
        .query(query)
        .set('Cookie', cookie)
        .expect(422);
    }
    await request(app.getHttpServer())
      .get('/api/v1/activities/not-a-uuid')
      .set('Cookie', cookie)
      .expect(422);
    expect(listSpy).not.toHaveBeenCalled();
    expect(getSpy).not.toHaveBeenCalled();
  });
});
