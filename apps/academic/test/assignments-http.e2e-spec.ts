import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';
import type { Assignment } from '../src/assignments/assignment.types';

type AssignmentJson = Omit<
  Assignment,
  'due_at' | 'created_at' | 'updated_at'
> & {
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

describe('Assignments (HTTP)', () => {
  let app: INestApplication<App>;
  let database: DatabaseService;
  let accountId: string;
  let otherAccountId: string;
  let token: string;
  let otherToken: string;
  const path = '/api/v1/assignments';
  const validInput = {
    title: '  Preparar la entrega  ',
    course_name: ' Cloud Computing ',
    section: 'practice',
    mandatory: true,
    due_date: '2026-11-24',
  };

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
       VALUES ($1, 'Assignments HTTP test A', $2),
              ($3, 'Assignments HTTP test B', $4)`,
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

  function createAssignment(
    body: Record<string, unknown> = validInput,
    credential = token,
  ) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${credential}`)
      .send(body);
  }

  async function expectNoAssignments(): Promise<void> {
    const result = await database.query<{ count: string }>(
      `SELECT count(*) FROM academic.assignments
       WHERE account_id IN ($1, $2)`,
      [accountId, otherAccountId],
    );
    expect(result.rows[0].count).toBe('0');
  }

  function listAssignments(
    query: Record<string, unknown> = {},
    credential = token,
  ) {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${credential}`)
      .query(query);
  }

  function assignmentDetails(id: string, credential = token) {
    return request(app.getHttpServer())
      .get(`${path}/${id}`)
      .set('Authorization', `Bearer ${credential}`);
  }

  function updateAssignment(
    id: string,
    body: Record<string, unknown>,
    credential = token,
  ) {
    return request(app.getHttpServer())
      .patch(`${path}/${id}`)
      .set('Authorization', `Bearer ${credential}`)
      .send(body);
  }

  async function createForUpdate(
    changes: Record<string, unknown> = {},
    credential = token,
  ): Promise<AssignmentJson> {
    const created = await createAssignment(
      { ...validInput, status: 'in_progress', grade: 8.75, ...changes },
      credential,
    ).expect(201);
    const { id } = created.body as { id: string };
    // Old fixed dates make timestamp assertions deterministic without sleeps.
    await database.query(
      `UPDATE academic.assignments
       SET created_at = '2000-01-01T10:00:00Z',
           updated_at = '2000-01-02T10:00:00Z'
       WHERE id = $1`,
      [id],
    );
    const details = await assignmentDetails(id, credential).expect(200);
    return details.body as AssignmentJson;
  }

  async function assignmentSnapshot(
    id: string,
  ): Promise<Record<string, unknown>> {
    const result = await database.query<{ snapshot: Record<string, unknown> }>(
      'SELECT to_jsonb(a) AS snapshot FROM academic.assignments AS a WHERE id = $1',
      [id],
    );
    return result.rows[0].snapshot;
  }

  it('updates descriptive fields and a false mandatory flag while preserving omitted fields', async () => {
    const before = await createForUpdate({ course_abbreviation: 'CC' });
    const response = await updateAssignment(before.id, {
      title: "  Nueva entrega del equipo 'A'  ",
      course_name: ' Diseño de Software ',
      course_abbreviation: ' DES ',
      section: 'seminar',
      mandatory: false,
    })
      .expect(200)
      .expect('Cache-Control', 'no-store');
    const updated = response.body as AssignmentJson;

    expect(updated).toEqual({
      ...before,
      title: "Nueva entrega del equipo 'A'",
      course_name: 'Diseño de Software',
      course_abbreviation: 'DES',
      section: 'seminar',
      mandatory: false,
      updated_at: updated.updated_at,
    });
    expect(Date.parse(updated.updated_at)).toBeGreaterThan(
      Date.parse(before.updated_at),
    );
    await assignmentDetails(before.id).expect(200).expect(updated);
    await listAssignments().expect(200).expect([updated]);
  });

  it('removes a course abbreviation without modifying other fields', async () => {
    const before = await createForUpdate({ course_abbreviation: 'CC' });
    const response = await updateAssignment(before.id, {
      course_abbreviation: null,
    }).expect(200);
    const updated = response.body as AssignmentJson;

    expect(updated).toEqual({
      ...before,
      course_abbreviation: null,
      updated_at: updated.updated_at,
    });
    expect(Date.parse(updated.updated_at)).toBeGreaterThan(
      Date.parse(before.updated_at),
    );
    await assignmentDetails(before.id).expect(200).expect(updated);
  });

  it('preserves updated_at when descriptive fields normalize to their existing values', async () => {
    const before = await createForUpdate();

    await updateAssignment(before.id, {
      title: `  ${before.title}  `,
      mandatory: before.mandatory,
      course_abbreviation: null,
    })
      .expect(200)
      .expect(before);
    await assignmentDetails(before.id).expect(200).expect(before);
  });

  it('updates status and grade through HTTP while preserving identity and all other details', async () => {
    const before = await createForUpdate({
      work_mode: 'group',
      group_members: ['Ana', 'Luis'],
      weight_percent: 30,
      weight_basis: 'section',
    });
    const response = await updateAssignment(before.id, {
      status: 'submitted',
      grade: 9.25,
    })
      .expect(200)
      .expect('Cache-Control', 'no-store');
    const updated = response.body as AssignmentJson;

    expect(updated).toEqual({
      ...before,
      status: 'submitted',
      grade: 9.25,
      updated_at: updated.updated_at,
    });
    expect(Date.parse(updated.updated_at)).toBeGreaterThan(
      Date.parse(before.updated_at),
    );
    expect(updated).not.toHaveProperty('account_id');
    expect(updated).not.toHaveProperty('token_hash');
    await assignmentDetails(before.id).expect(200).expect(updated);
    await listAssignments().expect(200).expect([updated]);
  });

  it('updates only the requested status without clearing the existing grade', async () => {
    const before = await createForUpdate();
    const response = await updateAssignment(before.id, {
      status: 'submitted',
    }).expect(200);
    const updated = response.body as AssignmentJson;

    expect(updated).toEqual({
      ...before,
      status: 'submitted',
      updated_at: updated.updated_at,
    });
    expect(Date.parse(updated.updated_at)).toBeGreaterThan(
      Date.parse(before.updated_at),
    );
    await assignmentDetails(before.id).expect(200).expect(updated);
  });

  it('updates a grade to zero without resetting the omitted status', async () => {
    const before = await createForUpdate();
    const response = await updateAssignment(before.id, { grade: 0 }).expect(
      200,
    );
    const updated = response.body as AssignmentJson;

    expect(updated).toEqual({
      ...before,
      grade: 0,
      updated_at: updated.updated_at,
    });
    expect(Date.parse(updated.updated_at)).toBeGreaterThan(
      Date.parse(before.updated_at),
    );
    await assignmentDetails(before.id).expect(200).expect(updated);
  });

  it('removes a grade with null while preserving the remaining assignment', async () => {
    const before = await createForUpdate();
    const response = await updateAssignment(before.id, { grade: null }).expect(
      200,
    );
    const updated = response.body as AssignmentJson;

    expect(updated).toEqual({
      ...before,
      grade: null,
      updated_at: updated.updated_at,
    });
    expect(Date.parse(updated.updated_at)).toBeGreaterThan(
      Date.parse(before.updated_at),
    );
    await assignmentDetails(before.id).expect(200).expect(updated);
  });

  it('preserves updated_at when repeating the same update', async () => {
    const before = await createForUpdate();
    const patch = { status: 'submitted', grade: 9.25 };
    const first = await updateAssignment(before.id, patch).expect(200);

    await updateAssignment(before.id, patch)
      .expect(200)
      .expect(first.body as object);
    await assignmentDetails(before.id)
      .expect(200)
      .expect(first.body as object);
  });

  it('preserves updated_at when removing an already absent grade', async () => {
    const before = await createForUpdate({ grade: null });

    await updateAssignment(before.id, { grade: null })
      .expect(200)
      .expect(before);
    await assignmentDetails(before.id).expect(200).expect(before);
  });

  it.each([
    { label: 'empty update', patch: {} },
    { label: 'null status', patch: { status: null } },
    { label: 'unknown status', patch: { status: 'unknown' } },
    { label: 'negative grade', patch: { grade: -0.01 } },
    { label: 'grade above ten', patch: { grade: 10.01 } },
    {
      label: 'invalid grade alongside a valid status',
      patch: { status: 'submitted', grade: 7.125 },
    },
    { label: 'numeric grade supplied as text', patch: { grade: '8.75' } },
    {
      label: 'client-supplied owner',
      patch: {
        status: 'submitted',
        account_id: '11111111-1111-4111-8111-111111111111',
      },
    },
    {
      label: 'client-supplied ID',
      patch: {
        status: 'submitted',
        id: '11111111-1111-4111-8111-111111111111',
      },
    },
    {
      label: 'client-supplied creation time',
      patch: { status: 'submitted', created_at: '2026-11-24T22:59:00Z' },
    },
    {
      label: 'client-supplied modification time',
      patch: { status: 'submitted', updated_at: '2026-11-24T22:59:00Z' },
    },
    {
      label: 'blank title alongside a valid status',
      patch: { status: 'submitted', title: '   ' },
    },
  ])(
    'rejects a PATCH with $label without modifying the stored assignment',
    async ({ patch }) => {
      const before = await createForUpdate();
      const snapshot = await assignmentSnapshot(before.id);

      await updateAssignment(before.id, patch).expect(422);
      await expect(assignmentSnapshot(before.id)).resolves.toEqual(snapshot);
    },
  );

  it('returns the same 404 for updates to foreign or nonexistent assignments and preserves foreign data', async () => {
    const foreign = await createForUpdate({}, otherToken);
    const snapshot = await assignmentSnapshot(foreign.id);
    const denied = await updateAssignment(foreign.id, {
      status: 'submitted',
      grade: 0,
    })
      .set('X-Account-Id', otherAccountId)
      .expect(404)
      .expect({
        statusCode: 404,
        message: 'Entrega no encontrada',
        error: 'Not Found',
      });
    const missing = await updateAssignment(randomUUID(), {
      status: 'submitted',
    }).expect(404);

    expect(missing.body as unknown).toEqual(denied.body as unknown);
    await expect(assignmentSnapshot(foreign.id)).resolves.toEqual(snapshot);
    await assignmentDetails(foreign.id, otherToken).expect(200).expect(foreign);
  });

  it.each([
    'not-a-uuid',
    '11111111-1111-1111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
  ])('rejects a PATCH with invalid UUID %s', async (id) => {
    const before = await createForUpdate();
    const snapshot = await assignmentSnapshot(before.id);

    await updateAssignment(id, { status: 'submitted' }).expect(422);
    await expect(assignmentSnapshot(before.id)).resolves.toEqual(snapshot);
  });

  it.each(['missing', 'unknown', 'disabled'])(
    'rejects a PATCH with a %s credential before body validation or mutation',
    async (kind) => {
      const before = await createForUpdate();
      const snapshot = await assignmentSnapshot(before.id);
      let credential = token;
      if (kind === 'unknown') credential = randomBytes(32).toString('hex');
      if (kind === 'disabled') {
        await database.query(
          'UPDATE academic.accounts SET enabled = false WHERE id = $1',
          [accountId],
        );
      }
      const pending = updateAssignment(before.id, {}, credential);
      if (kind === 'missing') pending.unset('Authorization');

      await pending.expect(401).expect({
        statusCode: 401,
        message: 'Credencial académica no válida',
        error: 'Unauthorized',
      });
      await expect(assignmentSnapshot(before.id)).resolves.toEqual(snapshot);
    },
  );

  it('returns the full public details of an owned assignment with consistent serialization', async () => {
    const created = await createAssignment({
      ...validInput,
      due_date: null,
      due_at: '2026-11-24T23:59:00+01:00',
      work_mode: 'group',
      group_members: ['Ana', 'Luis'],
      grade: 0,
      weight_percent: 30,
      weight_basis: 'section',
    }).expect(201);
    const body = created.body as { id: string };

    const details = await assignmentDetails(body.id)
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect(created.body as Record<string, unknown>);
    expect(details.body as unknown).not.toHaveProperty('account_id');
    expect(details.body as unknown).not.toHaveProperty('token_hash');
  });

  it('returns the same 404 for a foreign assignment and a nonexistent one', async () => {
    const created = await createAssignment(validInput, otherToken).expect(201);
    const body = created.body as { id: string };
    const foreign = await assignmentDetails(body.id)
      .set('X-Account-Id', otherAccountId)
      .expect(404)
      .expect({
        statusCode: 404,
        message: 'Entrega no encontrada',
        error: 'Not Found',
      });
    const missing = await assignmentDetails(randomUUID()).expect(404);
    expect(missing.body as unknown).toEqual(foreign.body as unknown);

    await assignmentDetails(body.id, otherToken)
      .expect(200)
      .expect(created.body as Record<string, unknown>);
  });

  it.each([
    'not-a-uuid',
    '11111111-1111-1111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
  ])('rejects an invalid assignment UUID (%s)', async (id) => {
    await assignmentDetails(id).expect(422);
  });

  it.each(['missing', 'unknown', 'disabled'])(
    'requires a valid credential before parsing a detail ID (%s)',
    async (kind) => {
      let credential = token;
      if (kind === 'unknown') credential = randomBytes(32).toString('hex');
      if (kind === 'disabled') {
        await database.query(
          'UPDATE academic.accounts SET enabled = false WHERE id = $1',
          [accountId],
        );
      }
      const pending = assignmentDetails('not-a-uuid', credential);
      if (kind === 'missing') pending.unset('Authorization');
      await pending.expect(401).expect({
        statusCode: 401,
        message: 'Credencial académica no válida',
        error: 'Unauthorized',
      });
    },
  );

  async function seedAssignments(
    owner: string,
    count: number,
    createdAt: string,
  ): Promise<string[]> {
    const result = await database.query<{ id: string }>(
      `INSERT INTO academic.assignments (
         account_id, title, course_name, section, mandatory,
         due_date, created_at
       ) SELECT $1, 'Entrega ' || n, 'Cloud Computing', 'practice', true,
                '2026-11-24'::date, $3::timestamptz
         FROM generate_series(1, $2::integer) AS n
       RETURNING id`,
      [owner, count, createdAt],
    );
    return result.rows.map((row) => row.id);
  }

  it('returns an empty list for an account without assignments', async () => {
    await listAssignments()
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect([]);
  });

  it('lists the created assignment with the same public representation', async () => {
    const created = await createAssignment({
      ...validInput,
      mandatory: false,
      grade: 0,
      weight_percent: 0,
      weight_basis: 'course',
    }).expect(201);

    await listAssignments()
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect([created.body as unknown]);

    await listAssignments({}, otherToken).expect(200).expect([]);
  });

  it('paginates only owned assignments in creation order with stable ID tie-breaking', async () => {
    const olderIds = await seedAssignments(
      accountId,
      1,
      '2026-11-01T10:00:00Z',
    );
    const newerIds = await seedAssignments(
      accountId,
      4,
      '2026-11-02T10:00:00Z',
    );
    const foreignIds = await seedAssignments(
      otherAccountId,
      3,
      '2026-11-03T10:00:00Z',
    );
    const expectedIds = [...newerIds.sort().reverse(), ...olderIds];

    async function page(offset: number): Promise<string[]> {
      const response = await listAssignments({ limit: 2, offset }).expect(200);
      const rows = response.body as { id: string }[];
      return rows.map((row) => row.id);
    }

    const firstPage = await page(0);
    const secondPage = await page(2);
    const thirdPage = await page(4);
    expect(firstPage).toEqual(expectedIds.slice(0, 2));
    expect(secondPage).toEqual(expectedIds.slice(2, 4));
    expect(thirdPage).toEqual(expectedIds.slice(4));
    expect([...firstPage, ...secondPage, ...thirdPage]).toEqual(expectedIds);
    expect(new Set([...firstPage, ...secondPage, ...thirdPage]).size).toBe(5);
    await expect(page(0)).resolves.toEqual(firstPage);
    await expect(page(5)).resolves.toEqual([]);

    const foreignResponse = await listAssignments({}, otherToken).expect(200);
    const foreignRows = foreignResponse.body as { id: string }[];
    expect(foreignRows.map((row) => row.id)).toEqual(
      foreignIds.sort().reverse(),
    );
  });

  it('defaults to 20 results and accepts the maximum limit of 50', async () => {
    await seedAssignments(accountId, 21, '2026-11-02T10:00:00Z');

    const defaultResponse = await listAssignments().expect(200);
    const maximumResponse = await listAssignments({
      limit: '50',
      offset: '0',
    }).expect(200);
    const defaultRows = defaultResponse.body as { id: string }[];
    const maximumRows = maximumResponse.body as { id: string }[];

    expect(defaultRows).toHaveLength(20);
    expect(maximumRows).toHaveLength(21);
    expect(defaultRows).toEqual(maximumRows.slice(0, 20));
  });

  it.each([
    { label: 'zero limit', query: { limit: '0' } },
    { label: 'excessive limit', query: { limit: '51' } },
    { label: 'fractional limit', query: { limit: '1.5' } },
    { label: 'non-numeric limit', query: { limit: 'invalid' } },
    { label: 'negative offset', query: { offset: '-1' } },
    { label: 'fractional offset', query: { offset: '0.5' } },
    { label: 'non-numeric offset', query: { offset: 'invalid' } },
    { label: 'unsafe offset', query: { offset: '9007199254740992' } },
    { label: 'repeated limit', query: { limit: ['1', '2'] } },
    { label: 'repeated offset', query: { offset: ['0', '1'] } },
    {
      label: 'client-supplied owner',
      query: { account_id: '11111111-1111-4111-8111-111111111111' },
    },
    { label: 'unknown query parameter', query: { unexpected: 'true' } },
  ])('rejects a list query with $label', async ({ query }) => {
    await listAssignments(query).expect(422);
  });

  it.each(['missing', 'unknown', 'disabled'])(
    'rejects a %s credential before validating list parameters',
    async (kind) => {
      let credential = token;
      if (kind === 'unknown') credential = randomBytes(32).toString('hex');
      if (kind === 'disabled') {
        await database.query(
          'UPDATE academic.accounts SET enabled = false WHERE id = $1',
          [accountId],
        );
      }
      const pending = listAssignments({ limit: '0' }, credential);
      if (kind === 'missing') pending.unset('Authorization');
      await pending.expect(401).expect({
        statusCode: 401,
        message: 'Credencial académica no válida',
        error: 'Unauthorized',
      });
    },
  );

  it('creates a normalized assignment with defaults and no private account fields', async () => {
    const response = await createAssignment()
      .expect(201)
      .expect('Cache-Control', 'no-store');
    const body = response.body as Record<string, unknown>;

    expect(body).toMatchObject({
      title: 'Preparar la entrega',
      course_name: 'Cloud Computing',
      course_abbreviation: null,
      section: 'practice',
      mandatory: true,
      due_date: '2026-11-24',
      due_at: null,
      status: 'pending',
      work_mode: 'individual',
      group_members: [],
      grade: null,
      weight_percent: null,
      weight_basis: null,
    });
    expect(typeof body.id).toBe('string');
    expect(typeof body.created_at).toBe('string');
    expect(typeof body.updated_at).toBe('string');
    expect(body).not.toHaveProperty('account_id');
    expect(body).not.toHaveProperty('token_hash');
    expect(JSON.stringify(body)).not.toContain(token);

    const stored = await database.query<{ account_id: string; title: string }>(
      'SELECT account_id, title FROM academic.assignments WHERE id = $1',
      [body.id],
    );
    expect(stored.rows).toEqual([
      { account_id: accountId, title: 'Preparar la entrega' },
    ]);
  });

  it('creates a graded group assignment and returns numbers and trimmed member names', async () => {
    const response = await createAssignment({
      ...validInput,
      course_abbreviation: ' CC ',
      status: 'submitted',
      work_mode: 'group',
      group_members: [' Ana ', ' Luis '],
      grade: 8.75,
      weight_percent: 30,
      weight_basis: 'section',
    }).expect(201);

    expect(response.body as unknown).toMatchObject({
      course_abbreviation: 'CC',
      status: 'submitted',
      work_mode: 'group',
      group_members: ['Ana', 'Luis'],
      grade: 8.75,
      weight_percent: 30,
      weight_basis: 'section',
    });
  });

  it('serializes an exact deadline in UTC while leaving the date-only field empty', async () => {
    const response = await createAssignment({
      ...validInput,
      due_date: null,
      due_at: '2026-11-24T23:59:00+01:00',
    }).expect(201);

    expect(response.body as unknown).toMatchObject({
      due_date: null,
      due_at: '2026-11-24T22:59:00.000Z',
    });
  });

  it('preserves zero grade, zero percentage and a false mandatory flag', async () => {
    const response = await createAssignment({
      ...validInput,
      mandatory: false,
      grade: 0,
      weight_percent: 0,
      weight_basis: 'course',
    }).expect(201);

    expect(response.body as unknown).toMatchObject({
      mandatory: false,
      grade: 0,
      weight_percent: 0,
      weight_basis: 'course',
    });
  });

  it('assigns each creation to the account identified by its credential', async () => {
    const first = await createAssignment()
      .set('X-Account-Id', otherAccountId)
      .expect(201);
    const second = await createAssignment(validInput, otherToken).expect(201);
    const firstBody = first.body as Record<string, unknown>;
    const secondBody = second.body as Record<string, unknown>;
    const stored = await database.query<{ id: string; account_id: string }>(
      'SELECT id, account_id FROM academic.assignments WHERE id IN ($1, $2)',
      [firstBody.id, secondBody.id],
    );

    expect(stored.rows).toHaveLength(2);
    expect(stored.rows).toEqual(
      expect.arrayContaining([
        { id: firstBody.id, account_id: accountId },
        { id: secondBody.id, account_id: otherAccountId },
      ]),
    );
  });

  it.each([
    { label: 'missing title', changes: { title: undefined } },
    { label: 'string boolean', changes: { mandatory: 'false' } },
    { label: 'missing deadline', changes: { due_date: null } },
    {
      label: 'both deadline fields',
      changes: { due_at: '2026-11-24T22:59:00Z' },
    },
    { label: 'impossible calendar date', changes: { due_date: '2026-02-30' } },
    {
      label: 'instant without time zone',
      changes: { due_date: null, due_at: '2026-11-24T22:59:00' },
    },
    {
      label: 'members in an individual assignment',
      changes: { group_members: ['Ana'] },
    },
    { label: 'grade requiring rounding', changes: { grade: 7.125 } },
    { label: 'grade out of range', changes: { grade: 10.01 } },
    { label: 'percentage without basis', changes: { weight_percent: 30 } },
    {
      label: 'percentage above 100',
      changes: { weight_percent: 101, weight_basis: 'course' },
    },
    { label: 'unknown field', changes: { unexpected: true } },
    {
      label: 'client-supplied owner',
      changes: { account_id: '11111111-1111-4111-8111-111111111111' },
    },
    {
      label: 'client-supplied ID',
      changes: { id: '11111111-1111-4111-8111-111111111111' },
    },
    {
      label: 'client-supplied creation time',
      changes: { created_at: '2026-11-24T22:59:00Z' },
    },
  ])(
    'rejects $label with 422 without creating an assignment',
    async ({ changes }) => {
      const response = await createAssignment({
        ...validInput,
        ...changes,
      }).expect(422);
      const body = response.body as Record<string, unknown>;
      expect(body.statusCode).toBe(422);
      expect(Array.isArray(body.message)).toBe(true);
      await expectNoAssignments();
    },
  );

  it.each(['missing', 'unknown', 'malformed', 'disabled'])(
    'rejects a %s credential before validating the body or writing data',
    async (kind) => {
      let credential = token;
      if (kind === 'unknown') credential = randomBytes(32).toString('hex');
      if (kind === 'malformed') credential = 'abc';
      if (kind === 'disabled') {
        await database.query(
          'UPDATE academic.accounts SET enabled = false WHERE id = $1',
          [accountId],
        );
      }
      const pending = createAssignment({}, credential);
      if (kind === 'missing') pending.unset('Authorization');
      await pending.expect(401).expect({
        statusCode: 401,
        message: 'Credencial académica no válida',
        error: 'Unauthorized',
      });
      await expectNoAssignments();
    },
  );
});
