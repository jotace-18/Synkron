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

test('exam edits send only changes and deletion handles unavailable records and uncertain responses', async (t) => {
  const { updateExam, retireExam, ExamUnavailableError, UnconfirmedExamError } = await import('../src/exams/exams-client.ts')
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === '/api/v1/auth/csrf') return Response.json({ csrf_token: 'fresh-csrf' })
    calls.push({ url, options })
    return new Response(null, { status: [200, 204, 404, 503][calls.length - 1] })
  })
  await updateExam('exam-1', { grade: 0 })
  await retireExam('exam-1')
  await assert.rejects(retireExam('exam-1'), ExamUnavailableError)
  await assert.rejects(retireExam('exam-1'), UnconfirmedExamError)
  await updateExam('exam-1', {})
  assert.equal(calls.length, 4)
  assert.deepEqual(JSON.parse(calls[0].options.body), { grade: 0 })
  assert.equal(calls[0].options.method, 'PATCH')
  assert.equal(calls[1].options.method, 'DELETE')
  assert.equal(calls[1].options.body, undefined)
  assert.ok(calls.every(({ url }) => url === '/api/v1/exams/exam-1'))
})
