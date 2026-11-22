import { BadGatewayException } from '@nestjs/common';
import type { AcademicAssignmentSource } from './assignment-source.types';
import { parseAcademicAssignment } from './assignment-source.validator';

describe('parseAcademicAssignment', () => {
  function assignment(): AcademicAssignmentSource {
    return {
      id: 'd1903b29-d126-4c48-9bbf-226cf0829309',
      title: 'Entrega de prácticas',
      course_name: 'Cloud Computing',
      course_abbreviation: null,
      section: 'practice',
      mandatory: true,
      due_date: '2026-11-24',
      due_at: null,
      status: 'pending',
      work_mode: 'individual',
      group_members: [],
      weight_percent: null,
      weight_basis: null,
      grade: null,
      created_at: '2026-11-08T19:00:00.000Z',
      updated_at: '2026-11-08T19:00:00.000Z',
      deleted_at: null,
    };
  }

  it('accepts an exported assignment with nullable optional data', () => {
    const source = assignment();
    expect(parseAcademicAssignment(source)).toEqual(source);
  });

  it('preserves false, zero grades and zero weights', () => {
    const source = {
      ...assignment(),
      mandatory: false,
      grade: 0,
      weight_percent: 0,
      weight_basis: 'course',
    };
    expect(parseAcademicAssignment(source)).toEqual(source);
  });

  it('accepts an instant deadline, descriptive fields and a fractional grade', () => {
    const source = {
      ...assignment(),
      course_abbreviation: 'CC',
      due_date: null,
      due_at: '2026-11-24T23:59:00+01:00',
      grade: 8.75,
      weight_percent: 25,
      weight_basis: 'section',
      status: 'submitted',
    };
    expect(parseAcademicAssignment(source)).toEqual(source);
  });

  it('accepts named group members and preserves an explicit deletion mark', () => {
    const source = {
      ...assignment(),
      work_mode: 'group',
      group_members: ['Ana', 'Luis'],
      status: 'in_progress',
      deleted_at: '2026-11-09T12:00:00.000Z',
      updated_at: '2026-11-09T12:00:00.000Z',
    };
    expect(parseAcademicAssignment(source)).toEqual(source);
  });

  it.each(['theory', 'practice', 'seminar'])(
    'accepts the section %s',
    (section) => {
      expect(
        parseAcademicAssignment({ ...assignment(), section }).section,
      ).toBe(section);
    },
  );

  it.each([
    [null, null],
    ['2026-11-24', '2026-11-24T23:59:00Z'],
    ['2026-02-30', null],
    [null, '2026-02-30T23:59:00Z'],
    [null, '2026-11-24T23:59:00'],
  ])(
    'rejects an absent, duplicated or invalid deadline (%s, %s)',
    (due_date, due_at) => {
      expect(() =>
        parseAcademicAssignment({ ...assignment(), due_date, due_at }),
      ).toThrow(BadGatewayException);
    },
  );

  it('preserves a leap-day deadline without converting it into an instant', () => {
    const source = { ...assignment(), due_date: '2028-02-29' };
    expect(parseAcademicAssignment(source)).toEqual(source);
  });

  it.each(['created_at', 'updated_at', 'deleted_at'])(
    'rejects a timestamp without timezone in %s',
    (field) => {
      expect(() =>
        parseAcademicAssignment({
          ...assignment(),
          [field]: '2026-11-08T19:00:00',
        }),
      ).toThrow(BadGatewayException);
    },
  );

  it.each(['created_at', 'updated_at', 'deleted_at'])(
    'rejects an impossible calendar day in %s',
    (field) => {
      expect(() =>
        parseAcademicAssignment({
          ...assignment(),
          [field]: '2026-02-30T19:00:00Z',
        }),
      ).toThrow(BadGatewayException);
    },
  );

  it.each(Object.keys(assignment()))(
    'rejects a missing %s field, including nullable fields',
    (field) => {
      const source: Record<string, unknown> = { ...assignment() };
      delete source[field];
      expect(() => parseAcademicAssignment(source)).toThrow(
        BadGatewayException,
      );
    },
  );

  it.each([null, undefined, [], 'assignment', 42, true])(
    'rejects a non-object record: %s',
    (value) => {
      expect(() => parseAcademicAssignment(value)).toThrow(BadGatewayException);
    },
  );

  const invalidFields: [keyof AcademicAssignmentSource, unknown][] = [
    ['id', null],
    ['id', 123],
    ['title', null],
    ['course_name', false],
    ['course_abbreviation', 123],
    ['section', 'laboratory'],
    ['section', null],
    ['mandatory', 'true'],
    ['mandatory', 1],
    ['due_date', 20261124],
    ['due_at', {}],
    ['status', 'done'],
    ['status', null],
    ['work_mode', 'team'],
    ['work_mode', null],
    ['group_members', 'Ana'],
    ['group_members', null],
    ['group_members', ['Ana', 123]],
    ['group_members', ['Ana', null]],
    ['weight_percent', '25'],
    ['weight_percent', NaN],
    ['weight_percent', Infinity],
    ['weight_basis', 'total'],
    ['grade', '8.75'],
    ['grade', NaN],
    ['grade', -Infinity],
    ['created_at', null],
    ['updated_at', 123],
    ['deleted_at', true],
    ['id', 'not-a-uuid'],
    ['id', 'd1903b29-d126-1c48-9bbf-226cf0829309'],
    ['id', 'd1903b29-d126-4c48-0bbf-226cf0829309'],
    ['title', ''],
    ['title', ' \t\n'],
    ['title', 'x'.repeat(201)],
    ['course_name', ''],
    ['course_name', '   '],
    ['course_name', 'x'.repeat(151)],
    ['course_abbreviation', ''],
    ['course_abbreviation', '   '],
    ['course_abbreviation', 'x'.repeat(21)],
    ['grade', -0.01],
    ['grade', 10.01],
    ['grade', 8.751],
    ['grade', 0.001],
    ['grade', 1e-7],
    ['grade', true],
  ];

  it.each(invalidFields)('rejects an invalid %s value (%s)', (field, value) => {
    const source = { ...assignment(), [field]: value };
    expect(() => parseAcademicAssignment(source)).toThrow(BadGatewayException);
  });

  it.each([0, 0.01, 0.29, 1.1, 8.75, 9.99, 10, null])(
    'accepts a valid optional grade without rounding or changing it: %s',
    (grade) => {
      const source = { ...assignment(), grade };
      expect(parseAcademicAssignment(source)).toEqual(source);
    },
  );

  it.each([
    [0, 'course'],
    [100, 'section'],
    [12.3456, 'course'],
    [null, null],
  ])(
    'accepts a complete optional weight (%s, %s)',
    (weight_percent, weight_basis) => {
      const source = { ...assignment(), weight_percent, weight_basis };
      expect(parseAcademicAssignment(source)).toEqual(source);
    },
  );

  it.each([
    [null, 'course'],
    [25, null],
    [0, null],
    [-0.01, 'course'],
    [100.01, 'section'],
    ['25', 'course'],
    [NaN, 'course'],
    [Infinity, 'course'],
    [25, 'total'],
  ])(
    'rejects an incomplete or invalid weight (%s, %s)',
    (weight_percent, weight_basis) => {
      expect(() =>
        parseAcademicAssignment({
          ...assignment(),
          weight_percent,
          weight_basis,
        }),
      ).toThrow(BadGatewayException);
    },
  );

  it.each([
    ['individual', []],
    ['group', []],
    ['group', ['Ana']],
    ['group', ['Ana', 'Luis']],
  ])(
    'accepts valid optional participants for %s: %s',
    (work_mode, group_members) => {
      const source = { ...assignment(), work_mode, group_members };
      expect(parseAcademicAssignment(source)).toEqual(source);
    },
  );

  it.each([
    ['individual', ['Ana']],
    ['group', ['']],
    ['group', ['Ana', '  \t']],
    ['group', ['Ana', null]],
    ['group', ['Ana', 123]],
    ['group', null],
  ])(
    'rejects inconsistent participants for %s: %s',
    (work_mode, group_members) => {
      expect(() =>
        parseAcademicAssignment({
          ...assignment(),
          work_mode,
          group_members,
        }),
      ).toThrow(BadGatewayException);
    },
  );

  it('accepts maximum text lengths and a source UUID written in uppercase', () => {
    const source = {
      ...assignment(),
      id: assignment().id.toUpperCase(),
      title: 'x'.repeat(200),
      course_name: 'x'.repeat(150),
      course_abbreviation: 'x'.repeat(20),
    };
    expect(parseAcademicAssignment(source)).toEqual(source);
  });

  it('counts Unicode characters like Academic text validation', () => {
    const source = { ...assignment(), title: '📚'.repeat(200) };
    expect(parseAcademicAssignment(source)).toEqual(source);
    expect(() =>
      parseAcademicAssignment({ ...source, title: '📚'.repeat(201) }),
    ).toThrow(BadGatewayException);
  });

  it('does not mutate a source record while validating its data', () => {
    const source = Object.freeze({ ...assignment(), grade: 0.29 });
    const before = JSON.stringify(source);
    parseAcademicAssignment(source);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('reports the contract failure without exposing the rejected source contents', () => {
    const source = {
      ...assignment(),
      title: { secret: 'private source data' },
    };
    let caught: unknown;
    try {
      parseAcademicAssignment(source);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadGatewayException);
    expect((caught as BadGatewayException).getResponse()).toEqual({
      statusCode: 502,
      message: 'Academic devolvió una entrega con estructura inválida',
      error: 'Bad Gateway',
    });
  });
});
