import assert from 'node:assert/strict'
import test from 'node:test'
import { isOverdue, summarizeCourse } from '../src/courses/course-summary.ts'

const assignment = (id, fields = {}) => ({
  id, title: id, status: 'pending', due_date: null, due_at: null,
  section: 'practice', grade: null, weight_percent: null, weight_basis: null, ...fields,
})
const exam = (id, fields = {}) => ({
  id, title: id, status: 'scheduled', exam_date: null, exam_at: null,
  section: 'theory', grade: null, weight_percent: null, weight_basis: null, ...fields,
})
const course = (assignments = [], exams = []) => ({ id: 'CC', name: 'Cloud Computing', abbreviation: 'CC', assignments, exams })

test('separates pending work, submitted assignments and scheduled exams, ordering deadlines in Madrid', () => {
  const result = summarizeCourse(course([
    assignment('undated'),
    assignment('later', { due_date: '2026-11-27' }),
    assignment('date-only', { due_date: '2026-11-26', status: 'in_progress' }),
    assignment('timed', { due_at: '2026-11-26T09:00:00Z' }),
    assignment('submitted', { status: 'submitted', due_date: '2026-01-01' }),
  ], [
    exam('cancelled', { status: 'cancelled' }),
    exam('completed', { status: 'completed' }),
    exam('undated-exam'),
    exam('dated-exam', { exam_date: '2026-11-28' }),
  ]), new Date('2026-11-26T12:00:00Z'))
  assert.deepEqual(result.pending.map((item) => item.id), ['timed', 'date-only', 'later', 'undated'])
  assert.deepEqual(result.submitted.map((item) => item.id), ['submitted'])
  assert.deepEqual(result.scheduled.map((item) => item.id), ['dated-exam', 'undated-exam'])
  assert.equal(result.overdue, 1)
  assert.equal(result.progress, 20)
})

test('date-only deadlines remain valid through the whole Madrid day, regardless of UTC date', () => {
  const item = assignment('today', { due_date: '2026-11-26' })
  assert.equal(isOverdue(item, new Date('2026-11-26T22:59:59Z')), false)
  assert.equal(isOverdue(item, new Date('2026-11-26T23:00:00Z')), true)
  assert.equal(isOverdue({ ...item, status: 'submitted' }, new Date('2026-11-27T10:00:00Z')), false)
  assert.equal(isOverdue(assignment('undated')), false)
})

test('preserves zero grades and weights, excludes cancelled exams, and computes an arithmetic average', () => {
  const result = summarizeCourse(course([
    assignment('zero', { grade: 0, weight_percent: 0, weight_basis: 'course' }),
    assignment('ungraded'),
  ], [
    exam('graded', { grade: 8, weight_percent: 50, weight_basis: 'section', status: 'completed' }),
    exam('cancelled', { grade: 10, status: 'cancelled' }),
  ]))
  assert.equal(result.average, 4)
  assert.equal(result.grades.length, 2)
  assert.equal(result.grades[0].grade, 0)
  assert.equal(result.grades[0].weight, 0)
  assert.equal(result.grades[1].basis, 'section')
  const empty = summarizeCourse(course())
  assert.equal(empty.average, null)
  assert.equal(empty.progress, 0)
  assert.equal(empty.overdue, 0)
})
