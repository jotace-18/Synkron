import assert from 'node:assert/strict'
import test from 'node:test'
import { readExamForm, examPatch } from '../src/exams/exam-form.ts'

test('exam form preserves a date-only record and switches dates atomically in Madrid', () => {
  const form = new FormData()
  for (const [key, value] of Object.entries({
    title: 'Parcial CC',
    course_abbreviation: 'CC',
    section: 'theory',
    status: 'scheduled',
    date: '2026-11-25',
    time: '',
    grade: '0',
    topics: 'Temas 1 y 2',
  }))
    form.set(key, value)
  const input = readExamForm(form)
  assert.equal(input.exam_date, '2026-11-25')
  assert.equal(input.exam_at, null)
  assert.equal(input.grade, 0)
  assert.equal(input.course_name, 'Cloud Computing')
  form.set('time', '10:00')
  const timed = readExamForm(form, input)
  assert.deepEqual(examPatch(timed, input), {
    exam_date: null,
    exam_at: '2026-11-25T09:00:00.000Z',
  })
  assert.deepEqual(examPatch(timed, timed), {})
})
