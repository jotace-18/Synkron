import { randomBytes, randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { CreateAssignmentDto } from '../src/assignments/dto/create-assignment.dto';
import type { UpdateAssignmentDto } from '../src/assignments/dto/update-assignment.dto';
import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service';

describe('AssignmentsService (integration)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let assignments: AssignmentsService;
  let accountId: string;
  let otherAccountId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [DatabaseService, AssignmentsService],
    }).compile();
    await module.init();
    database = module.get(DatabaseService);
    assignments = module.get(AssignmentsService);
  });

  beforeEach(async () => {
    accountId = randomUUID();
    otherAccountId = randomUUID();
    await database.query(
      `INSERT INTO academic.accounts (id, name, token_hash)
       VALUES ($1, 'Assignments service test A', $2),
              ($3, 'Assignments service test B', $4)`,
      [
        accountId,
        randomBytes(32).toString('hex'),
        otherAccountId,
        randomBytes(32).toString('hex'),
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
    await module?.close();
  });

  function createInput(changes: Record<string, unknown> = {}) {
    return plainToInstance(CreateAssignmentDto, {
      title: 'Preparar la entrega',
      course_name: 'Cloud Computing',
      section: 'practice',
      mandatory: true,
      due_date: '2026-11-24',
      ...changes,
    });
  }

  async function createExistingAssignment(
    changes: Record<string, unknown> = {},
  ) {
    const created = await assignments.create(accountId, createInput(changes));
    // Fixed earlier dates make timestamp checks deterministic without sleeps.
    await database.query(
      `UPDATE academic.assignments
       SET created_at = '2000-01-01T10:00:00Z',
           updated_at = '2000-01-02T10:00:00Z'
       WHERE account_id = $1 AND id = $2`,
      [accountId, created.id],
    );
    return assignments.getById(accountId, created.id);
  }

  it('updates status and grade while preserving identity, creation time and other details', async () => {
    const before = await createExistingAssignment({
      course_abbreviation: 'CC',
      work_mode: 'group',
      group_members: ['Ana', 'Luis'],
      weight_percent: 30,
      weight_basis: 'section',
    });
    const updated = await assignments.update(accountId, before.id, {
      status: 'submitted',
      grade: 8.75,
    });

    expect(updated).toEqual({
      ...before,
      status: 'submitted',
      grade: 8.75,
      updated_at: updated.updated_at,
    });
    expect(updated.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
    expect(updated).not.toHaveProperty('account_id');
    await expect(assignments.getById(accountId, before.id)).resolves.toEqual(
      updated,
    );
    const stored = await database.query<{ count: string }>(
      'SELECT count(*) FROM academic.assignments WHERE account_id = $1',
      [accountId],
    );
    expect(stored.rows[0].count).toBe('1');
  });

  it('changes only the status and keeps an omitted grade', async () => {
    const before = await createExistingAssignment({ grade: 8.75 });
    const updated = await assignments.update(accountId, before.id, {
      status: 'in_progress',
    });

    expect(updated).toEqual({
      ...before,
      status: 'in_progress',
      updated_at: updated.updated_at,
    });
    expect(updated.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
    await expect(assignments.getById(accountId, before.id)).resolves.toEqual(
      updated,
    );
  });

  it('changes a grade to zero while preserving an omitted status', async () => {
    const before = await createExistingAssignment({
      status: 'in_progress',
      grade: 8.75,
    });
    const updated = await assignments.update(accountId, before.id, {
      grade: 0,
    });

    expect(updated).toEqual({
      ...before,
      grade: 0,
      updated_at: updated.updated_at,
    });
    expect(updated.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
    await expect(assignments.getById(accountId, before.id)).resolves.toEqual(
      updated,
    );
  });

  it('removes an existing grade with null while preserving the status', async () => {
    const before = await createExistingAssignment({
      status: 'submitted',
      grade: 8.75,
    });
    const updated = await assignments.update(accountId, before.id, {
      grade: null,
    });

    expect(updated).toEqual({
      ...before,
      grade: null,
      updated_at: updated.updated_at,
    });
    expect(updated.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
    await expect(assignments.getById(accountId, before.id)).resolves.toEqual(
      updated,
    );
  });

  it.each<{
    label: string;
    initial: Record<string, unknown>;
    patch: UpdateAssignmentDto;
  }>([
    {
      label: 'the same status and grade',
      initial: { status: 'submitted', grade: 8.75 },
      patch: { status: 'submitted', grade: 8.75 },
    },
    { label: 'an already absent grade', initial: {}, patch: { grade: null } },
    {
      label: 'an unchanged zero grade',
      initial: { grade: 0 },
      patch: { grade: 0 },
    },
  ])(
    'preserves updated_at when receiving $label',
    async ({ initial, patch }) => {
      const before = await createExistingAssignment(initial);
      await expect(
        assignments.update(accountId, before.id, patch),
      ).resolves.toEqual(before);
      await expect(assignments.getById(accountId, before.id)).resolves.toEqual(
        before,
      );
    },
  );

  it('returns the same not-found error for a foreign or nonexistent assignment and leaves the foreign data intact', async () => {
    const before = await assignments.create(
      otherAccountId,
      createInput({ grade: 8.75 }),
    );

    for (const id of [before.id, randomUUID()]) {
      const pending = assignments.update(accountId, id, {
        status: 'submitted',
        grade: 0,
      });
      await expect(pending).rejects.toBeInstanceOf(NotFoundException);
      await expect(pending).rejects.toThrow('Entrega no encontrada');
    }
    await expect(
      assignments.getById(otherAccountId, before.id),
    ).resolves.toEqual(before);
  });

  it('preserves both changes when status and grade are updated concurrently', async () => {
    const before = await createExistingAssignment();

    await Promise.all([
      assignments.update(accountId, before.id, { status: 'submitted' }),
      assignments.update(accountId, before.id, { grade: 9.25 }),
    ]);

    const updated = await assignments.getById(accountId, before.id);
    expect(updated).toEqual({
      ...before,
      status: 'submitted',
      grade: 9.25,
      updated_at: updated.updated_at,
    });
    expect(updated.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
  });

  it('persists a minimal assignment for its account and returns its public fields', async () => {
    const result = await assignments.create(accountId, createInput());

    expect(result).toMatchObject({
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
    expect(typeof result.id).toBe('string');
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result).not.toHaveProperty('account_id');

    const stored = await database.query<{ account_id: string; title: string }>(
      'SELECT account_id, title FROM academic.assignments WHERE id = $1',
      [result.id],
    );
    expect(stored.rows).toEqual([
      { account_id: accountId, title: 'Preparar la entrega' },
    ]);
  });

  it('preserves zero grade, zero weight and an optional assignment as distinct from unknown', async () => {
    const result = await assignments.create(
      accountId,
      createInput({
        mandatory: false,
        grade: 0,
        weight_percent: 0,
        weight_basis: 'course',
      }),
    );

    expect(result.mandatory).toBe(false);
    expect(result.grade).toBe(0);
    expect(result.weight_percent).toBe(0);
    expect(result.weight_basis).toBe('course');
    const stored = await database.query<{
      mandatory: boolean;
      grade: string;
      weight_percent: string;
    }>(
      'SELECT mandatory, grade, weight_percent FROM academic.assignments WHERE id = $1',
      [result.id],
    );
    expect(stored.rows).toEqual([
      { mandatory: false, grade: '0', weight_percent: '0' },
    ]);
  });

  it('stores all the details of a graded group assignment and returns numeric values', async () => {
    const result = await assignments.create(
      accountId,
      createInput({
        title: "  Entrega de mi equipo 'A'  ",
        course_abbreviation: ' CC ',
        status: 'submitted',
        work_mode: 'group',
        group_members: [' Ana ', ' Luis '],
        grade: 8.75,
        weight_percent: 12.345,
        weight_basis: 'section',
      }),
    );

    expect(result).toMatchObject({
      title: "Entrega de mi equipo 'A'",
      course_abbreviation: 'CC',
      status: 'submitted',
      work_mode: 'group',
      group_members: ['Ana', 'Luis'],
      grade: 8.75,
      weight_percent: 12.345,
      weight_basis: 'section',
    });
    const stored = await database.query<{
      grade: string;
      weight_percent: string;
    }>('SELECT grade, weight_percent FROM academic.assignments WHERE id = $1', [
      result.id,
    ]);
    expect(stored.rows).toEqual([{ grade: '8.75', weight_percent: '12.345' }]);
  });

  it('preserves an exact deadline with an offset without inventing a date-only value', async () => {
    const result = await assignments.create(
      accountId,
      createInput({ due_date: null, due_at: '2026-11-24T23:59:00+01:00' }),
    );

    expect(result.due_date).toBeNull();
    expect(result.due_at).toBeInstanceOf(Date);
    expect(result.due_at?.toISOString()).toBe('2026-11-24T22:59:00.000Z');
  });

  it('uses the supplied account context even if a direct caller includes an owner in the input', async () => {
    const first = await assignments.create(
      accountId,
      createInput({ account_id: otherAccountId }),
    );
    const second = await assignments.create(otherAccountId, createInput());
    const stored = await database.query<{ id: string; account_id: string }>(
      'SELECT id, account_id FROM academic.assignments WHERE id IN ($1, $2)',
      [first.id, second.id],
    );

    expect(stored.rows).toHaveLength(2);
    expect(stored.rows).toEqual(
      expect.arrayContaining([
        { id: first.id, account_id: accountId },
        { id: second.id, account_id: otherAccountId },
      ]),
    );
    expect(first).not.toHaveProperty('account_id');
    expect(second).not.toHaveProperty('account_id');
  });

  it('creates separate identities for two assignments with the same title and deadline', async () => {
    const first = await assignments.create(accountId, createInput());
    const second = await assignments.create(accountId, createInput());

    expect(first.id).not.toBe(second.id);
    const stored = await database.query<{ count: string }>(
      'SELECT count(*) FROM academic.assignments WHERE account_id = $1',
      [accountId],
    );
    expect(stored.rows[0].count).toBe('2');
  });
});
