import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import type { Assignment } from '../src/assignments/assignment.types';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';

type AssignmentJson = Omit<
  Assignment,
  'due_at' | 'created_at' | 'updated_at' | 'deleted_at'
> & {
  due_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

describe('Assignments consistency, deletion and export (HTTP)', () => {
  let app: INestApplication<App>;
  let database: DatabaseService;
  let accountId: string;
  let otherAccountId: string;
  let token: string;
  let otherToken: string;
  const path = '/api/v1/assignments';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    database = app.get(DatabaseService);
  });

  beforeEach(async () => {
    accountId = randomUUID();
    otherAccountId = randomUUID();
    token = randomBytes(32).toString('hex');
    otherToken = randomBytes(32).toString('hex');
    await database.query(
      `INSERT INTO academic.accounts (id, name, token_hash)
       VALUES ($1, 'Lifecycle test A', $2), ($3, 'Lifecycle test B', $4)`,
      [
        accountId,
        createHash('sha256').update(token).digest('hex'),
        otherAccountId,
        createHash('sha256').update(otherToken).digest('hex'),
      ],
    );
  });

  afterEach(async () => {
    await database.query(
      'DELETE FROM academic.assignments WHERE account_id IN ($1, $2)',
      [accountId, otherAccountId],
    );
    await database.query('DELETE FROM academic.accounts WHERE id IN ($1, $2)', [
      accountId,
      otherAccountId,
    ]);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function create(
    changes: Record<string, unknown> = {},
    credential = token,
  ): Promise<AssignmentJson> {
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${credential}`)
      .send({
        title: 'Entrega',
        course_name: 'Cloud Computing',
        section: 'practice',
        mandatory: true,
        due_date: '2026-11-24',
        grade: 8.75,
        ...changes,
      })
      .expect(201);
    const body = response.body as AssignmentJson;
    await database.query(
      `UPDATE academic.assignments
       SET created_at = '2000-01-01T10:00:00Z', updated_at = '2000-01-02T10:00:00Z'
       WHERE id = $1`,
      [body.id],
    );
    const details = await request(app.getHttpServer())
      .get(`${path}/${body.id}`)
      .set('Authorization', `Bearer ${credential}`)
      .expect(200);
    return details.body as AssignmentJson;
  }

  function patch(
    id: string,
    body: Record<string, unknown>,
    credential = token,
  ) {
    return request(app.getHttpServer())
      .patch(`${path}/${id}`)
      .set('Authorization', `Bearer ${credential}`)
      .send(body);
  }

  function remove(id: string, credential = token) {
    return request(app.getHttpServer())
      .delete(`${path}/${id}`)
      .set('Authorization', `Bearer ${credential}`);
  }

  function list(
    route = path,
    query: Record<string, unknown> = {},
    credential = token,
  ) {
    return request(app.getHttpServer())
      .get(route)
      .set('Authorization', `Bearer ${credential}`)
      .query(query);
  }

  async function snapshot(id: string) {
    const result = await database.query<{ snapshot: Record<string, unknown> }>(
      'SELECT to_jsonb(a) AS snapshot FROM academic.assignments AS a WHERE id = $1',
      [id],
    );
    return result.rows[0].snapshot;
  }

  it('changes a date-only deadline while keeping its precision and other fields', async () => {
    const before = await create();
    const response = await patch(before.id, { due_date: '2026-12-01' }).expect(
      200,
    );
    const updated = response.body as AssignmentJson;
    expect(updated).toEqual({
      ...before,
      due_date: '2026-12-01',
      updated_at: updated.updated_at,
    });
    expect(Date.parse(updated.updated_at)).toBeGreaterThan(
      Date.parse(before.updated_at),
    );
  });

  it('switches a day deadline to an instant by explicitly clearing the old representation', async () => {
    const before = await create();
    const response = await patch(before.id, {
      due_date: null,
      due_at: '2026-12-01T18:00:00+01:00',
    }).expect(200);
    expect(response.body as unknown).toMatchObject({
      id: before.id,
      due_date: null,
      due_at: '2026-12-01T17:00:00.000Z',
    });
  });

  it('switches an instant deadline to a day without inventing a time', async () => {
    const before = await create({
      due_date: null,
      due_at: '2026-11-24T18:00:00Z',
    });
    const response = await patch(before.id, {
      due_at: null,
      due_date: '2026-12-01',
    }).expect(200);
    expect(response.body as unknown).toMatchObject({
      id: before.id,
      due_date: '2026-12-01',
      due_at: null,
    });
  });

  it('recognizes the same instant expressed with another offset as unchanged', async () => {
    const before = await create({
      due_date: null,
      due_at: '2026-12-01T17:00:00Z',
    });
    await patch(before.id, { due_at: '2026-12-01T18:00:00+01:00' })
      .expect(200)
      .expect(before);
  });

  it.each([
    { due_date: null, due_at: null },
    { due_at: '2026-12-01T18:00:00Z' },
    { due_date: null },
  ])(
    'rejects an inconsistent final deadline atomically (%j)',
    async (changes) => {
      const before = await create();
      const stored = await snapshot(before.id);
      const response = await patch(before.id, { ...changes, grade: 0 }).expect(
        422,
      );
      expect(typeof (response.body as { message: unknown }).message).toBe(
        'string',
      );
      await expect(snapshot(before.id)).resolves.toEqual(stored);
    },
  );

  it('changes to a group and trims its optional members', async () => {
    const before = await create();
    const response = await patch(before.id, {
      work_mode: 'group',
      group_members: [' Ana ', ' Luis '],
    }).expect(200);
    expect(response.body as unknown).toMatchObject({
      work_mode: 'group',
      group_members: ['Ana', 'Luis'],
      grade: before.grade,
    });
  });

  it('edits members without requiring the unchanged group mode', async () => {
    const before = await create({ work_mode: 'group', group_members: ['Ana'] });
    const response = await patch(before.id, {
      group_members: [' Ana, María ', " O'Neil "],
    }).expect(200);
    expect(response.body as unknown).toMatchObject({
      work_mode: 'group',
      group_members: ['Ana, María', "O'Neil"],
    });
  });

  it('changes a group to an individual assignment when the member list is explicitly cleared', async () => {
    const before = await create({ work_mode: 'group', group_members: ['Ana'] });
    const response = await patch(before.id, {
      work_mode: 'individual',
      group_members: [],
    }).expect(200);
    expect(response.body as unknown).toMatchObject({
      work_mode: 'individual',
      group_members: [],
    });
  });

  it.each([
    {
      initial: { work_mode: 'group', group_members: ['Ana'] },
      changes: { work_mode: 'individual' },
    },
    { initial: {}, changes: { group_members: ['Ana'] } },
  ])(
    'rejects an inconsistent final group atomically (%j)',
    async ({ initial, changes }) => {
      const before = await create(initial);
      const stored = await snapshot(before.id);
      await patch(before.id, { ...changes, grade: 0 }).expect(422);
      await expect(snapshot(before.id)).resolves.toEqual(stored);
    },
  );

  it('allows a group whose member names are not yet known', async () => {
    const before = await create();
    const response = await patch(before.id, { work_mode: 'group' }).expect(200);
    expect(response.body as unknown).toMatchObject({
      work_mode: 'group',
      group_members: [],
    });
  });

  it('sets a known zero percentage with its basis', async () => {
    const before = await create();
    const response = await patch(before.id, {
      weight_percent: 0,
      weight_basis: 'course',
    }).expect(200);
    expect(response.body as unknown).toMatchObject({
      weight_percent: 0,
      weight_basis: 'course',
    });
  });

  it('changes a percentage while preserving its existing basis', async () => {
    const before = await create({ weight_percent: 25, weight_basis: 'course' });
    const response = await patch(before.id, { weight_percent: 12.345 }).expect(
      200,
    );
    expect(response.body as unknown).toMatchObject({
      weight_percent: 12.345,
      weight_basis: 'course',
    });
  });

  it('changes the basis while preserving its existing percentage', async () => {
    const before = await create({ weight_percent: 25, weight_basis: 'course' });
    const response = await patch(before.id, { weight_basis: 'section' }).expect(
      200,
    );
    expect(response.body as unknown).toMatchObject({
      weight_percent: 25,
      weight_basis: 'section',
    });
  });

  it('removes a percentage and its basis together', async () => {
    const before = await create({ weight_percent: 25, weight_basis: 'course' });
    const response = await patch(before.id, {
      weight_percent: null,
      weight_basis: null,
    }).expect(200);
    expect(response.body as unknown).toMatchObject({
      weight_percent: null,
      weight_basis: null,
    });
  });

  it.each([
    { initial: {}, changes: { weight_percent: 30 } },
    {
      initial: { weight_percent: 25, weight_basis: 'course' },
      changes: { weight_basis: null },
    },
    {
      initial: { weight_percent: 25, weight_basis: 'course' },
      changes: { weight_percent: null },
    },
  ])(
    'rejects an inconsistent final weight atomically (%j)',
    async ({ initial, changes }) => {
      const before = await create(initial);
      const stored = await snapshot(before.id);
      await patch(before.id, { ...changes, grade: 0 }).expect(422);
      await expect(snapshot(before.id)).resolves.toEqual(stored);
    },
  );

  it('updates every editable field in one atomic request with typed parameters', async () => {
    const before = await create();
    const response = await patch(before.id, {
      title: ' Nueva entrega ',
      course_name: ' Diseño ',
      course_abbreviation: ' DES ',
      section: 'theory',
      mandatory: false,
      due_date: null,
      due_at: '2026-12-01T18:00:00+01:00',
      status: 'submitted',
      work_mode: 'group',
      group_members: [' Ana '],
      weight_percent: 0,
      weight_basis: 'section',
      grade: 0,
    }).expect(200);
    const updated = response.body as AssignmentJson;
    expect(updated).toEqual({
      ...before,
      title: 'Nueva entrega',
      course_name: 'Diseño',
      course_abbreviation: 'DES',
      section: 'theory',
      mandatory: false,
      due_date: null,
      due_at: '2026-12-01T17:00:00.000Z',
      status: 'submitted',
      work_mode: 'group',
      group_members: ['Ana'],
      weight_percent: 0,
      weight_basis: 'section',
      grade: 0,
      updated_at: updated.updated_at,
    });
    expect(Date.parse(updated.updated_at)).toBeGreaterThan(
      Date.parse(before.updated_at),
    );
    const details = await request(app.getHttpServer())
      .get(`${path}/${before.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(details.body as unknown).toEqual(updated);
  });

  it('deletes idempotently, hides the assignment and retains its deletion marker for Sync', async () => {
    const before = await create();
    const originalSnapshot = await snapshot(before.id);
    expect(before.deleted_at).toBeNull();
    await remove(before.id)
      .expect(204)
      .expect('Cache-Control', 'no-store')
      .expect('');
    const stored = await snapshot(before.id);
    expect(typeof stored.deleted_at).toBe('string');
    expect(stored.updated_at).toEqual(stored.deleted_at);
    expect(stored.created_at).toEqual(originalSnapshot.created_at);
    await list().expect(200).expect([]);
    await request(app.getHttpServer())
      .get(`${path}/${before.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const exported = await list(`${path}/export`)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    const rows = exported.body as AssignmentJson[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: before.id,
      created_at: before.created_at,
    });
    expect(rows[0].deleted_at).not.toBeNull();
    expect(rows[0].updated_at).toBe(rows[0].deleted_at);

    await remove(before.id).expect(204).expect('');
    await expect(snapshot(before.id)).resolves.toEqual(stored);
  });

  it('does not disclose or delete a foreign assignment', async () => {
    const foreign = await create({}, otherToken);
    const stored = await snapshot(foreign.id);
    const denied = await remove(foreign.id).expect(404);
    const missing = await remove(randomUUID()).expect(404);
    expect(denied.body as unknown).toEqual(missing.body as unknown);
    await expect(snapshot(foreign.id)).resolves.toEqual(stored);
  });

  it('rejects edits to a deleted assignment without restoring it', async () => {
    const before = await create();
    await remove(before.id).expect(204);
    const stored = await snapshot(before.id);
    await patch(before.id, { status: 'submitted', grade: 0 }).expect(404);
    await expect(snapshot(before.id)).resolves.toEqual(stored);
  });

  it('filters deletions before normal pagination and exports only owned records including deletions', async () => {
    const activeA = await create();
    const activeB = await create();
    const deleted = await create();
    await database.query(
      "UPDATE academic.assignments SET created_at = '2001-01-01T10:00:00Z' WHERE id = $1",
      [deleted.id],
    );
    await remove(deleted.id).expect(204);
    await create({}, otherToken);
    const activeIds = [activeA.id, activeB.id].sort().reverse();
    for (let offset = 0; offset < 2; offset++) {
      const page = await list(path, { limit: 1, offset }).expect(200);
      expect((page.body as AssignmentJson[]).map((row) => row.id)).toEqual([
        activeIds[offset],
      ]);
    }
    await list(path, { limit: 1, offset: 2 }).expect(200).expect([]);
    const exported = await list(`${path}/export`, { limit: 50 }).expect(200);
    const rows = exported.body as AssignmentJson[];
    expect(rows.map((row) => row.id)).toEqual([deleted.id, ...activeIds]);
    for (const row of rows) {
      expect(row).not.toHaveProperty('account_id');
      expect(row).not.toHaveProperty('token_hash');
    }
    const page = await list(`${path}/export`, { limit: 1, offset: 1 }).expect(
      200,
    );
    expect((page.body as AssignmentJson[]).map((row) => row.id)).toEqual([
      activeIds[0],
    ]);
  });

  it.each(['delete', 'export'])(
    'requires authentication for %s',
    async (operation) => {
      const pending =
        operation === 'delete'
          ? remove(randomUUID()).unset('Authorization')
          : list(`${path}/export`).unset('Authorization');
      await pending.expect(401);
    },
  );

  it('rejects a malformed delete ID before mutating any assignment', async () => {
    const before = await create();
    const stored = await snapshot(before.id);
    await remove('not-a-uuid').expect(422);
    await expect(snapshot(before.id)).resolves.toEqual(stored);
  });

  it.each([{ limit: 0 }, { account_id: 'untrusted-account' }])(
    'validates export query parameters (%j)',
    async (query) => {
      await list(`${path}/export`, query).expect(422);
    },
  );

  it.each(['post', 'patch'])(
    'rejects a client-supplied deleted_at on %s',
    async (operation) => {
      if (operation === 'post') {
        await request(app.getHttpServer())
          .post(path)
          .set('Authorization', `Bearer ${token}`)
          .send({
            title: 'Entrega',
            course_name: 'CC',
            section: 'practice',
            mandatory: true,
            due_date: '2026-11-24',
            deleted_at: null,
          })
          .expect(422);
        await list().expect(200).expect([]);
      } else {
        const before = await create();
        const stored = await snapshot(before.id);
        await patch(before.id, { grade: 0, deleted_at: null }).expect(422);
        await expect(snapshot(before.id)).resolves.toEqual(stored);
      }
    },
  );
});
