import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAssignmentDto } from './create-assignment.dto';

describe('CreateAssignmentDto', () => {
  const validInput = {
    title: '  Preparar la entrega  ',
    course_name: '  Cloud Computing  ',
    course_abbreviation: ' CC ',
    section: 'practice',
    mandatory: true,
    due_date: '2026-11-24',
  };

  const validationOptions = {
    whitelist: true,
    forbidNonWhitelisted: true,
  };

  function createDto(changes: Record<string, unknown> = {}) {
    return plainToInstance(CreateAssignmentDto, { ...validInput, ...changes });
  }

  it('trims text while preserving a deadline known only by day', async () => {
    const dto = createDto();
    expect(await validate(dto, validationOptions)).toHaveLength(0);
    expect(dto.title).toBe('Preparar la entrega');
    expect(dto.course_name).toBe('Cloud Computing');
    expect(dto.course_abbreviation).toBe('CC');
    expect(dto.due_date).toBe('2026-11-24');
    expect(dto.due_at).toBeUndefined();
    expect(dto.status).toBe('pending');
    expect(dto.work_mode).toBe('individual');
    expect(dto.group_members).toEqual([]);
    expect(dto.grade).toBeUndefined();
    expect(dto.weight_percent).toBeUndefined();
    expect(dto.weight_basis).toBeUndefined();
  });

  it.each([undefined, null, 0, 7.25, 10])(
    'accepts optional grade %s without converting or rounding it',
    async (grade) => {
      const dto = createDto({ grade });
      expect(await validate(dto, validationOptions)).toHaveLength(0);
      expect(dto.grade).toBe(grade);
    },
  );

  it.each([
    -0.01,
    10.01,
    7.125,
    '7.25',
    '',
    true,
    NaN,
    Infinity,
    -Infinity,
    [],
    {},
  ])('rejects invalid grade %j', async (grade) => {
    const errors = await validate(createDto({ grade }), validationOptions);
    expect(errors.map((error) => error.property)).toContain('grade');
  });

  it.each([
    { weight_percent: null, weight_basis: null },
    { weight_percent: undefined, weight_basis: null },
    { weight_percent: null, weight_basis: undefined },
    { weight_percent: 0, weight_basis: 'course' },
    { weight_percent: 100, weight_basis: 'section' },
    { weight_percent: 12.345, weight_basis: 'course' },
  ])(
    'accepts weight $weight_percent relative to $weight_basis',
    async (input) => {
      const dto = createDto(input);
      expect(await validate(dto, validationOptions)).toHaveLength(0);
      expect(dto.weight_percent).toBe(input.weight_percent);
      expect(dto.weight_basis).toBe(input.weight_basis);
    },
  );

  it.each([
    {
      label: 'negative percentage',
      weight_percent: -1,
      weight_basis: 'course',
      property: 'weight_percent',
    },
    {
      label: 'percentage above 100',
      weight_percent: 101,
      weight_basis: 'section',
      property: 'weight_percent',
    },
    {
      label: 'string percentage',
      weight_percent: '30',
      weight_basis: 'course',
      property: 'weight_percent',
    },
    {
      label: 'boolean percentage',
      weight_percent: true,
      weight_basis: 'course',
      property: 'weight_percent',
    },
    {
      label: 'NaN percentage',
      weight_percent: NaN,
      weight_basis: 'course',
      property: 'weight_percent',
    },
    {
      label: 'infinite percentage',
      weight_percent: Infinity,
      weight_basis: 'course',
      property: 'weight_percent',
    },
    {
      label: 'missing basis',
      weight_percent: 30,
      weight_basis: undefined,
      property: 'weight_basis',
    },
    {
      label: 'null basis',
      weight_percent: 30,
      weight_basis: null,
      property: 'weight_basis',
    },
    {
      label: 'missing percentage',
      weight_percent: undefined,
      weight_basis: 'section',
      property: 'weight_basis',
    },
    {
      label: 'null percentage',
      weight_percent: null,
      weight_basis: 'course',
      property: 'weight_basis',
    },
    {
      label: 'unknown basis',
      weight_percent: 30,
      weight_basis: 'unknown',
      property: 'weight_basis',
    },
    {
      label: 'unknown basis without percentage',
      weight_percent: null,
      weight_basis: 'unknown',
      property: 'weight_basis',
    },
  ])(
    'rejects weight with $label',
    async ({ property, weight_percent, weight_basis }) => {
      const errors = await validate(
        createDto({ weight_percent, weight_basis }),
        validationOptions,
      );
      expect(errors.map((error) => error.property)).toContain(property);
    },
  );

  it('accepts a complete graded group assignment without changing its input values', async () => {
    const dto = createDto({
      due_date: null,
      due_at: '2026-11-24T23:59:00+01:00',
      status: 'submitted',
      work_mode: 'group',
      group_members: [' Ana ', ' Luis '],
      grade: 8.75,
      weight_percent: 30,
      weight_basis: 'section',
    });
    expect(await validate(dto, validationOptions)).toHaveLength(0);
    expect(dto.group_members).toEqual(['Ana', 'Luis']);
    expect(dto.grade).toBe(8.75);
    expect(dto.weight_percent).toBe(30);
    expect(dto.weight_basis).toBe('section');
  });

  it.each(['pending', 'in_progress', 'submitted'])(
    'accepts progress status %s',
    async (status) => {
      const dto = createDto({ status });
      expect(await validate(dto, validationOptions)).toHaveLength(0);
      expect(dto.status).toBe(status);
    },
  );

  it.each([null, 'unknown', 'overdue'])(
    'rejects invalid progress status %s',
    async (status) => {
      const errors = await validate(createDto({ status }), validationOptions);
      expect(errors.map((error) => error.property)).toContain('status');
    },
  );

  it('accepts a group assignment without known members', async () => {
    const dto = createDto({ work_mode: 'group' });
    expect(await validate(dto, validationOptions)).toHaveLength(0);
    expect(dto.group_members).toEqual([]);
  });

  it('trims group member names without changing their order', async () => {
    const dto = createDto({
      work_mode: 'group',
      group_members: ['  Ana María  ', ' Luis '],
    });
    expect(await validate(dto, validationOptions)).toHaveLength(0);
    expect(dto.group_members).toEqual(['Ana María', 'Luis']);
  });

  it('accepts an explicitly individual assignment with an empty member list', async () => {
    const dto = createDto({ work_mode: 'individual', group_members: [] });
    expect(await validate(dto, validationOptions)).toHaveLength(0);
  });

  it.each([null, 'unknown'])(
    'rejects invalid work mode %s',
    async (work_mode) => {
      const errors = await validate(
        createDto({ work_mode }),
        validationOptions,
      );
      expect(errors.map((error) => error.property)).toContain('work_mode');
    },
  );

  it.each([
    { label: 'null list', work_mode: 'group', group_members: null },
    { label: 'non-array list', work_mode: 'group', group_members: 'Ana' },
    { label: 'blank name', work_mode: 'group', group_members: ['   '] },
    { label: 'numeric name', work_mode: 'group', group_members: [123] },
    { label: 'null name', work_mode: 'group', group_members: [null] },
    {
      label: 'names in an individual assignment',
      work_mode: 'individual',
      group_members: ['Ana'],
    },
  ])(
    'rejects group members with $label',
    async ({ work_mode, group_members }) => {
      const errors = await validate(
        createDto({ work_mode, group_members }),
        validationOptions,
      );
      expect(errors.map((error) => error.property)).toContain('group_members');
    },
  );

  it('accepts text at the maximum supported lengths', async () => {
    const dto = createDto({
      title: 'a'.repeat(200),
      course_name: 'b'.repeat(150),
      course_abbreviation: 'c'.repeat(20),
    });
    expect(await validate(dto, validationOptions)).toHaveLength(0);
  });

  it.each(['theory', 'practice', 'seminar'])(
    'accepts section %s',
    async (section) => {
      expect(
        await validate(createDto({ section }), validationOptions),
      ).toHaveLength(0);
    },
  );

  it('accepts an explicitly optional assignment', async () => {
    const dto = createDto({ mandatory: false });
    expect(await validate(dto, validationOptions)).toHaveLength(0);
    expect(dto.mandatory).toBe(false);
  });

  it.each([undefined, null])(
    'accepts an unknown course abbreviation (%s)',
    async (course_abbreviation) => {
      expect(
        await validate(createDto({ course_abbreviation }), validationOptions),
      ).toHaveLength(0);
    },
  );

  it('accepts a real leap day with no instant', async () => {
    const dto = createDto({ due_date: '2028-02-29', due_at: null });
    expect(await validate(dto, validationOptions)).toHaveLength(0);
  });

  it.each([
    '2026-11-24T22:59:00Z',
    '2026-11-24T23:59:00+01:00',
    '2026-11-24T17:59:00-05:00',
    '2026-11-24T22:59:00.123Z',
  ])(
    'accepts an exact deadline with explicit time zone (%s)',
    async (due_at) => {
      const dto = createDto({ due_date: null, due_at });
      expect(await validate(dto, validationOptions)).toHaveLength(0);
      expect(dto.due_at).toBe(due_at);
    },
  );

  it('accepts an instant when the date field is omitted', async () => {
    const dto = createDto({
      due_date: undefined,
      due_at: '2026-11-24T22:59:00Z',
    });
    expect(await validate(dto, validationOptions)).toHaveLength(0);
  });

  it.each([
    {
      label: 'missing title',
      changes: { title: undefined },
      property: 'title',
    },
    { label: 'blank title', changes: { title: '   ' }, property: 'title' },
    { label: 'numeric title', changes: { title: 123 }, property: 'title' },
    {
      label: 'long title',
      changes: { title: 'a'.repeat(201) },
      property: 'title',
    },
    {
      label: 'missing course',
      changes: { course_name: undefined },
      property: 'course_name',
    },
    {
      label: 'blank course',
      changes: { course_name: '   ' },
      property: 'course_name',
    },
    {
      label: 'long course',
      changes: { course_name: 'a'.repeat(151) },
      property: 'course_name',
    },
    {
      label: 'blank abbreviation',
      changes: { course_abbreviation: '   ' },
      property: 'course_abbreviation',
    },
    {
      label: 'long abbreviation',
      changes: { course_abbreviation: 'a'.repeat(21) },
      property: 'course_abbreviation',
    },
    {
      label: 'missing section',
      changes: { section: undefined },
      property: 'section',
    },
    {
      label: 'unknown section',
      changes: { section: 'unknown' },
      property: 'section',
    },
    {
      label: 'missing mandatory flag',
      changes: { mandatory: undefined },
      property: 'mandatory',
    },
    {
      label: 'null mandatory flag',
      changes: { mandatory: null },
      property: 'mandatory',
    },
    {
      label: 'string boolean',
      changes: { mandatory: 'false' },
      property: 'mandatory',
    },
    {
      label: 'numeric boolean',
      changes: { mandatory: 0 },
      property: 'mandatory',
    },
  ])('rejects $label', async ({ changes, property }) => {
    const errors = await validate(createDto(changes), validationOptions);
    expect(errors.map((error) => error.property)).toContain(property);
  });

  it.each([
    { label: 'missing deadline', due_date: undefined, due_at: undefined },
    { label: 'null deadline', due_date: null, due_at: null },
    {
      label: 'both deadline fields',
      due_date: '2026-11-24',
      due_at: '2026-11-24T22:59:00Z',
    },
    { label: 'empty date', due_date: '', due_at: null },
    { label: 'non-leap February 29', due_date: '2026-02-29', due_at: null },
    { label: 'year zero', due_date: '0000-11-24', due_at: null },
    { label: 'February 30', due_date: '2026-02-30', due_at: null },
    { label: 'date in local notation', due_date: '24/11/2026', due_at: null },
    {
      label: 'instant in the date field',
      due_date: '2026-11-24T22:59:00Z',
      due_at: null,
    },
    { label: 'non-string date', due_date: 20261124, due_at: null },
  ])('rejects $label', async (changes) => {
    const errors = await validate(
      createDto({ due_date: changes.due_date, due_at: changes.due_at }),
      validationOptions,
    );
    expect(errors.map((error) => error.property)).toContain('due_date');
  });

  it.each([
    '2026-11-24T22:59:00',
    '2026-11-24',
    '2026-11-24 22:59:00Z',
    '2026-02-30T22:59:00Z',
    '2026-11-24T25:00:00Z',
    '2026-W48-2T22:59:00Z',
    '0000-11-24T22:59:00Z',
    '2026-11-24T22:59:00+24:00',
    '2026-11-24T22:59:00+01:99',
    '',
    123,
    { value: '2026-11-24T22:59:00Z' },
  ])('rejects an invalid or ambiguous instant (%j)', async (due_at) => {
    const errors = await validate(
      createDto({ due_date: null, due_at }),
      validationOptions,
    );
    expect(errors.map((error) => error.property)).toContain('due_at');
  });

  it.each(['account_id', 'id', 'created_at', 'updated_at', 'unexpected'])(
    'rejects client-supplied field %s',
    async (property) => {
      const errors = await validate(
        createDto({ [property]: 'client-supplied' }),
        validationOptions,
      );
      expect(errors.map((error) => error.property)).toContain(property);
    },
  );
});
