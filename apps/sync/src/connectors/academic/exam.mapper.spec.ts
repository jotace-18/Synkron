import { mapAcademicExam } from './exam.mapper';
import { parseAcademicExam } from './exam-source.validator';
const source = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Parcial CC',
  course_name: 'Cloud Computing',
  course_abbreviation: 'CC',
  topics: 'Temas 1 y 2',
  section: 'theory',
  status: 'scheduled',
  exam_date: '2026-11-25',
  exam_at: null,
  weight_percent: 0,
  weight_basis: 'course',
  grade: 0,
  created_at: '2026-11-22T10:00:00Z',
  updated_at: '2026-11-22T10:00:00Z',
  deleted_at: null,
};
describe('Academic exam mapping', () => {
  it('maps a date-only exam as a start while preserving zero values and exam-only details', () => {
    const mapped = mapAcademicExam('connection', source);
    expect(mapped.action).toBe('upsert');
    if (mapped.action !== 'upsert') throw new Error('Expected upsert');
    expect(mapped.activity).toMatchObject({
      type: 'academic.exam',
      source_collection: 'exams',
      schedule: { kind: 'date', role: 'start', date: source.exam_date },
      details: { topics: source.topics, grade: 0, weight_percent: 0 },
    });
    expect(mapped.activity.details).not.toHaveProperty('mandatory');
  });
  it('normalizes instants, keeps cancelled exams visible, and retires only deleted records', () => {
    const mapped = mapAcademicExam('connection', {
      ...source,
      status: 'cancelled',
      exam_date: null,
      exam_at: '2026-11-25T10:00:00+01:00',
    });
    expect(mapped).toMatchObject({
      action: 'upsert',
      activity: {
        status: 'cancelled',
        schedule: {
          role: 'start',
          kind: 'instant',
          at: '2026-11-25T09:00:00.000Z',
        },
      },
    });
    expect(
      mapAcademicExam('connection', {
        ...source,
        deleted_at: source.updated_at,
      }),
    ).toMatchObject({
      action: 'retire',
      external_id: source.id,
      source_collection: 'exams',
    });
  });
  it('rejects assignment states, ambiguous dates and incomplete weights', () => {
    for (const invalid of [
      { status: 'pending' },
      { exam_at: '2026-11-25T10:00:00Z' },
      { weight_basis: null },
      { section: 'seminar' },
      { topics: '' },
    ]) {
      expect(() => parseAcademicExam({ ...source, ...invalid })).toThrow();
    }
  });
});
