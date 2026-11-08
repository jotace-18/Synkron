import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAssignmentDto } from './update-assignment.dto';

describe('UpdateAssignmentDto', () => {
  const options = { whitelist: true, forbidNonWhitelisted: true };

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

  it.each(['account_id', 'id', 'created_at', 'unexpected'])(
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
