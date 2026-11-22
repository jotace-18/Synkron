import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAssignmentDto } from './update-assignment.dto';

describe('UpdateAssignmentDto', () => {
  const options = { whitelist: true, forbidNonWhitelisted: true };

  it.each([
    { due_date: '2026-12-01' },
    { due_date: null, due_at: '2026-12-01T18:00:00+01:00' },
    { due_at: null },
    { work_mode: 'group' },
    { group_members: [] },
    { weight_percent: 0 },
    { weight_basis: 'section' },
    { weight_percent: null, weight_basis: null },
  ])(
    'validates supplied values without requiring omitted paired fields (%j)',
    async (input) => {
      const dto = plainToInstance(UpdateAssignmentDto, input);
      expect(await validate(dto, options)).toHaveLength(0);
      expect(dto.status).toBeUndefined();
      expect(dto.grade).toBeUndefined();
    },
  );

  it('trims group members while retaining their order and punctuation', async () => {
    const dto = plainToInstance(UpdateAssignmentDto, {
      group_members: [' Ana, María ', " O'Neil "],
    });
    expect(await validate(dto, options)).toHaveLength(0);
    expect(dto.group_members).toEqual(['Ana, María', "O'Neil"]);
  });

  it.each([
    { input: { due_date: '2026-02-30' }, property: 'due_date' },
    { input: { due_date: '0000-01-01' }, property: 'due_date' },
    { input: { due_date: '01/12/2026' }, property: 'due_date' },
    { input: { due_date: '2026-12-01T18:00:00Z' }, property: 'due_date' },
    { input: { due_at: '2026-12-01T18:00:00' }, property: 'due_at' },
    { input: { due_at: '2026-02-30T18:00:00Z' }, property: 'due_at' },
    { input: { due_at: '2026-12-01' }, property: 'due_at' },
    { input: { work_mode: null }, property: 'work_mode' },
    { input: { work_mode: 'unknown' }, property: 'work_mode' },
    { input: { group_members: null }, property: 'group_members' },
    { input: { group_members: 'Ana' }, property: 'group_members' },
    { input: { group_members: ['   '] }, property: 'group_members' },
    { input: { group_members: [123] }, property: 'group_members' },
    { input: { weight_percent: -1 }, property: 'weight_percent' },
    { input: { weight_percent: 101 }, property: 'weight_percent' },
    { input: { weight_percent: '30' }, property: 'weight_percent' },
    { input: { weight_percent: Infinity }, property: 'weight_percent' },
    { input: { weight_basis: 'unknown' }, property: 'weight_basis' },
  ])('rejects malformed $property', async ({ input, property }) => {
    const errors = await validate(
      plainToInstance(UpdateAssignmentDto, input),
      options,
    );
    expect(errors.map((error) => error.property)).toContain(property);
  });

  it('accepts normalized metadata without assigning defaults to omitted status or grade', async () => {
    const dto = plainToInstance(UpdateAssignmentDto, {
      title: ' Nueva entrega ',
      course_name: ' Diseño de Software ',
      course_abbreviation: ' DES ',
      section: 'seminar',
      mandatory: false,
    });
    expect(await validate(dto, options)).toHaveLength(0);
    expect(dto).toMatchObject({
      title: 'Nueva entrega',
      course_name: 'Diseño de Software',
      course_abbreviation: 'DES',
      section: 'seminar',
      mandatory: false,
    });
    expect(dto.status).toBeUndefined();
    expect(dto.grade).toBeUndefined();
  });

  it('keeps omitted metadata undefined when updating only a grade', async () => {
    const dto = plainToInstance(UpdateAssignmentDto, { grade: 0 });
    expect(await validate(dto, options)).toHaveLength(0);
    expect(dto.title).toBeUndefined();
    expect(dto.course_name).toBeUndefined();
    expect(dto.course_abbreviation).toBeUndefined();
    expect(dto.section).toBeUndefined();
    expect(dto.mandatory).toBeUndefined();
  });

  it('accepts null to remove a course abbreviation', async () => {
    const dto = plainToInstance(UpdateAssignmentDto, {
      course_abbreviation: null,
    });
    expect(await validate(dto, options)).toHaveLength(0);
    expect(dto.course_abbreviation).toBeNull();
    expect(dto.course_name).toBeUndefined();
  });

  it.each([
    { label: 'blank title', input: { title: '   ' }, property: 'title' },
    { label: 'null title', input: { title: null }, property: 'title' },
    {
      label: 'oversized title',
      input: { title: 'a'.repeat(201) },
      property: 'title',
    },
    {
      label: 'null course',
      input: { course_name: null },
      property: 'course_name',
    },
    {
      label: 'blank abbreviation',
      input: { course_abbreviation: '   ' },
      property: 'course_abbreviation',
    },
    { label: 'null section', input: { section: null }, property: 'section' },
    {
      label: 'null mandatory flag',
      input: { mandatory: null },
      property: 'mandatory',
    },
    {
      label: 'string mandatory flag',
      input: { mandatory: 'false' },
      property: 'mandatory',
    },
  ])('rejects $label', async ({ input, property }) => {
    const errors = await validate(
      plainToInstance(UpdateAssignmentDto, input),
      options,
    );
    expect(errors.map((error) => error.property)).toContain(property);
  });

  it.each(['pending', 'in_progress', 'submitted'])(
    'accepts status %s without clearing an omitted grade',
    async (status) => {
      const dto = plainToInstance(UpdateAssignmentDto, { status });
      expect(await validate(dto, options)).toHaveLength(0);
      expect(dto.status).toBe(status);
      expect(dto.grade).toBeUndefined();
    },
  );

  it.each([undefined, null, 0, 8.75, 10])(
    'preserves the meaning of grade %s without setting a default status',
    async (grade) => {
      const dto = plainToInstance(UpdateAssignmentDto, { grade });
      expect(await validate(dto, options)).toHaveLength(0);
      expect(dto.grade).toBe(grade);
      expect(dto.status).toBeUndefined();
    },
  );

  it.each([null, 'unknown', 'overdue', true])(
    'rejects invalid status %s',
    async (status) => {
      const dto = plainToInstance(UpdateAssignmentDto, { status });
      const errors = await validate(dto, options);
      expect(errors.map((error) => error.property)).toContain('status');
    },
  );

  it.each([-0.01, 10.01, 7.125, '8.75', NaN, Infinity])(
    'rejects invalid grade %j without converting or rounding it',
    async (grade) => {
      const dto = plainToInstance(UpdateAssignmentDto, { grade });
      const errors = await validate(dto, options);
      expect(errors.map((error) => error.property)).toContain('grade');
      expect(dto.grade).toBe(grade);
    },
  );

  it.each(['account_id', 'id', 'created_at', 'deleted_at', 'unexpected'])(
    'rejects client-supplied field %s',
    async (property) => {
      const dto = plainToInstance(UpdateAssignmentDto, {
        status: 'submitted',
        [property]: 'client-supplied',
      });
      const errors = await validate(dto, options);
      expect(errors.map((error) => error.property)).toContain(property);
    },
  );

  it('accepts an explicit status and grade together', async () => {
    const dto = plainToInstance(UpdateAssignmentDto, {
      status: 'submitted',
      grade: 8.75,
    });
    expect(await validate(dto, options)).toHaveLength(0);
    expect(dto.status).toBe('submitted');
    expect(dto.grade).toBe(8.75);
  });

  it('allows removing a grade while explicitly changing the status', async () => {
    const dto = plainToInstance(UpdateAssignmentDto, {
      status: 'in_progress',
      grade: null,
    });
    expect(await validate(dto, options)).toHaveLength(0);
    expect(dto.status).toBe('in_progress');
    expect(dto.grade).toBeNull();
  });
});
