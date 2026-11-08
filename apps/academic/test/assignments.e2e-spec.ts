import { randomBytes, randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';

interface AssignmentInput {
  title: string;
  courseName: string;
  courseAbbreviation: string | null;
  section: string;
  dueDate: string | null;
  dueAt: string | null;
  status: string;
  workMode: string;
  groupMembers: (string | null)[];
  weightPercent: string | null;
  weightBasis: string | null;
  grade: string | null;
}

interface StoredAssignment {
  id: string;
  account_id: string;
  status: string;
  work_mode: string;
  group_members: string[];
  weight_percent: string | null;
  weight_basis: string | null;
  grade: string | null;
  due_date: string | null;
  due_at: Date | null;
}

describe('Assignments table (integration)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let accountId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [DatabaseService],
    }).compile();
    await module.init();
    database = module.get(DatabaseService);
  });

  beforeEach(async () => {
    accountId = randomUUID();
    await database.query(
      `INSERT INTO academic.accounts (id, name, token_hash)
       VALUES ($1, 'Assignments test', $2)`,
      [accountId, randomBytes(32).toString('hex')],
    );
  });

  afterEach(async () => {
    await database.query(
      'DELETE FROM academic.assignments WHERE account_id = $1',
      [accountId],
    );
    await database.query('DELETE FROM academic.accounts WHERE id = $1', [
      accountId,
    ]);
  });

  afterAll(async () => {
    await module?.close();
  });

  function insertAssignment(overrides: Partial<AssignmentInput> = {}) {
    const input: AssignmentInput = {
      title: 'Preparar la entrega',
      courseName: 'Cloud Computing',
      courseAbbreviation: 'CC',
      section: 'practice',
      dueDate: '2026-11-24',
      dueAt: null,
      status: 'pending',
      workMode: 'individual',
      groupMembers: [],
      weightPercent: null,
      weightBasis: null,
      grade: null,
      ...overrides,
    };

    return database.query<StoredAssignment>(
      `INSERT INTO academic.assignments (
         account_id, title, course_name, course_abbreviation, section,
         mandatory, due_date, due_at, status, work_mode, group_members,
         weight_percent, weight_basis, grade
       ) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, account_id, status, work_mode, group_members,
                 weight_percent, weight_basis, grade, due_date::text, due_at`,
      [
        accountId,
        input.title,
        input.courseName,
        input.courseAbbreviation,
        input.section,
        input.dueDate,
        input.dueAt,
        input.status,
        input.workMode,
        input.groupMembers,
        input.weightPercent,
        input.weightBasis,
        input.grade,
      ],
    );
  }

  it('rejects an assignment belonging to an account that does not exist', async () => {
    await expect(
      database.query(
        `INSERT INTO academic.assignments (
           account_id, title, course_name, section, mandatory, due_date
         ) VALUES ($1, 'Entrega', 'Cloud Computing', 'practice', true, '2026-11-24')`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'assignments_account_fk',
    });
  });

  it('creates a pending individual assignment with unknown grade and weight by default', async () => {
    const result = await database.query<StoredAssignment>(
      `INSERT INTO academic.assignments (
         account_id, title, course_name, section, mandatory, due_date
       ) VALUES ($1, 'Entrega', 'Cloud Computing', 'practice', false, '2026-11-24')
       RETURNING id, account_id, status, work_mode, group_members,
                 weight_percent, weight_basis, grade`,
      [accountId],
    );
    expect(result.rows).toHaveLength(1);
    expect(typeof result.rows[0].id).toBe('string');
    expect(result.rows[0]).toMatchObject({
      account_id: accountId,
      status: 'pending',
      work_mode: 'individual',
      group_members: [],
      grade: null,
      weight_percent: null,
      weight_basis: null,
    });
  });

  it('preserves a deadline known only by day without inventing an instant', async () => {
    const result = await insertAssignment();
    expect(result.rows[0].due_date).toBe('2026-11-24');
    expect(result.rows[0].due_at).toBeNull();
  });

  it('preserves an exact deadline as the same instant across time zones', async () => {
    const result = await insertAssignment({
      dueDate: null,
      dueAt: '2026-11-24T23:59:00+01:00',
    });
    expect(result.rows[0].due_date).toBeNull();
    expect(result.rows[0].due_at?.toISOString()).toBe(
      '2026-11-24T22:59:00.000Z',
    );
  });

  it.each([
    { label: 'missing deadline', dueDate: null, dueAt: null },
    {
      label: 'two deadline representations',
      dueDate: '2026-11-24',
      dueAt: '2026-11-24T22:59:00Z',
    },
  ])('rejects $label', async (input) => {
    await expect(insertAssignment(input)).rejects.toMatchObject({
      code: '23514',
      constraint: 'assignments_deadline_valid',
    });
  });

  it.each([null, '0', '7.25', '10'])(
    'stores optional grade %s without rounding',
    async (grade) => {
      const result = await insertAssignment({ grade });
      expect(result.rows[0].grade).toBe(grade);
    },
  );

  it.each(['-0.01', '10.01', '7.125'])(
    'rejects invalid grade %s',
    async (grade) => {
      await expect(insertAssignment({ grade })).rejects.toMatchObject({
        code: '23514',
        constraint: 'assignments_grade_valid',
      });
    },
  );

  it.each([
    { weightPercent: null, weightBasis: null },
    { weightPercent: '0', weightBasis: 'course' },
    { weightPercent: '100', weightBasis: 'section' },
    { weightPercent: '30', weightBasis: 'section' },
  ])(
    'preserves weight $weightPercent relative to $weightBasis',
    async (input) => {
      const result = await insertAssignment(input);
      expect(result.rows[0].weight_percent).toBe(input.weightPercent);
      expect(result.rows[0].weight_basis).toBe(input.weightBasis);
    },
  );

  it.each([
    {
      label: 'negative percentage',
      weightPercent: '-1',
      weightBasis: 'course',
    },
    {
      label: 'percentage above 100',
      weightPercent: '101',
      weightBasis: 'course',
    },
    {
      label: 'percentage without basis',
      weightPercent: '30',
      weightBasis: null,
    },
    {
      label: 'basis without percentage',
      weightPercent: null,
      weightBasis: 'section',
    },
    { label: 'unknown basis', weightPercent: '30', weightBasis: 'unknown' },
    {
      label: 'unknown basis without percentage',
      weightPercent: null,
      weightBasis: 'unknown',
    },
  ])('rejects weight with $label', async (input) => {
    await expect(insertAssignment(input)).rejects.toMatchObject({
      code: '23514',
      constraint: 'assignments_weight_valid',
    });
  });

  it.each(['pending', 'in_progress', 'submitted'])(
    'accepts status %s',
    async (status) => {
      const result = await insertAssignment({ status });
      expect(result.rows[0].status).toBe(status);
    },
  );

  it('rejects overdue as a stored progress status', async () => {
    await expect(insertAssignment({ status: 'overdue' })).rejects.toMatchObject(
      {
        code: '23514',
        constraint: 'assignments_status_valid',
      },
    );
  });

  it.each(['theory', 'practice', 'seminar'])(
    'accepts course section %s',
    async (section) => {
      const result = await insertAssignment({ section });
      expect(result.rows).toHaveLength(1);
    },
  );

  it('rejects an unknown course section', async () => {
    await expect(
      insertAssignment({ section: 'unknown' }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'assignments_section_valid',
    });
  });

  it.each([{ groupMembers: [] }, { groupMembers: ['Ana', 'Luis'] }])(
    'allows a group assignment with members $groupMembers',
    async ({ groupMembers }) => {
      const result = await insertAssignment({
        workMode: 'group',
        groupMembers,
      });
      expect(result.rows[0].group_members).toEqual(groupMembers);
    },
  );

  it('rejects an unknown work mode', async () => {
    await expect(
      insertAssignment({ workMode: 'unknown' }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'assignments_work_mode_valid',
    });
  });

  it.each([
    {
      label: 'individual assignment with members',
      workMode: 'individual',
      groupMembers: ['Ana'],
    },
    {
      label: 'group assignment with a null member',
      workMode: 'group',
      groupMembers: [null],
    },
  ])('rejects $label', async (input) => {
    await expect(insertAssignment(input)).rejects.toMatchObject({
      code: '23514',
      constraint: 'assignments_group_members_valid',
    });
  });

  it('adds a grade later while preserving the assignment identity and deadline', async () => {
    const created = (await insertAssignment()).rows[0];
    const result = await database.query<StoredAssignment>(
      `UPDATE academic.assignments SET grade = $1, updated_at = now()
       WHERE account_id = $2 AND id = $3
       RETURNING id, grade, due_date::text`,
      ['8.75', accountId, created.id],
    );
    expect(result.rows).toEqual([
      { id: created.id, grade: '8.75', due_date: '2026-11-24' },
    ]);
    const count = await database.query<{ count: string }>(
      'SELECT count(*) FROM academic.assignments WHERE account_id = $1',
      [accountId],
    );
    expect(count.rows[0].count).toBe('1');
  });

  it.each([
    {
      label: 'blank title',
      title: '   ',
      constraint: 'assignments_title_not_empty',
    },
    {
      label: 'blank course name',
      courseName: '   ',
      constraint: 'assignments_course_name_not_empty',
    },
    {
      label: 'blank abbreviation',
      courseAbbreviation: '   ',
      constraint: 'assignments_course_abbreviation_not_empty',
    },
  ])('rejects $label', async (input) => {
    await expect(insertAssignment(input)).rejects.toMatchObject({
      code: '23514',
      constraint: input.constraint,
    });
  });
});
