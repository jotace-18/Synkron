import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';

describe('Assignments creation (HTTP)', () => {
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
