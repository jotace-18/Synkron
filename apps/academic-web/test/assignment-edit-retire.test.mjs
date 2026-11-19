import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readAssignmentForm,
  assignmentPatch,
  assignmentDeadlineFields,
  assignmentCourseCode,
  CURRENT_COURSE,
} from '../src/assignments/assignment-form.ts'
import {
  updateAssignment,
  retireAssignment,
  AssignmentUnavailableError,
} from '../src/assignments/assignments-client.ts'

const original = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Trabajo antiguo',
  course_name: 'Pruebas Synkron',
  course_abbreviation: 'TEST',
  section: 'practice',
  mandatory: false,
  status: 'submitted',
  work_mode: 'group',
  group_members: ['Ana', 'Luis'],
  grade: 0,
  weight_percent: 0,
  weight_basis: 'section',
  due_date: null,
  due_at: '2026-10-25T01:30:45.123Z',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  deleted_at: null,
}

function existingForm() {
  const data = new FormData()
  for (const [name, value] of Object.entries({
    title: 'Trabajo antiguo',
    course_abbreviation: CURRENT_COURSE,
    section: 'practice',
    status: 'submitted',
    work_mode: 'group',
    group_members: 'Ana\nLuis',
    grade: '0',
    weight_percent: '0',
    weight_basis: 'section',
    date: '2026-10-25',
    time: '02:30',
  }))
    data.set(name, value)
  return data
}

test('editing only a grade preserves legacy courses, group, zero values and the exact original repeated-hour instant', () => {
  assert.equal(assignmentCourseCode(original), CURRENT_COURSE)
  assert.deepEqual(assignmentDeadlineFields(original), {
    date: '2026-10-25',
    time: '02:30',
  })
  const data = existingForm()
  const unchanged = readAssignmentForm(data, original)
  assert.equal(unchanged.due_at, original.due_at)
  assert.equal(unchanged.course_name, original.course_name)
  assert.equal(unchanged.mandatory, false)
  assert.deepEqual(assignmentPatch(unchanged, original), {})

  data.set('grade', '8.75')
  assert.deepEqual(
    assignmentPatch(readAssignmentForm(data, original), original),
    { grade: 8.75 },
  )
  data.set('grade', '')
  assert.deepEqual(
    assignmentPatch(readAssignmentForm(data, original), original),
    { grade: null },
  )
})

test('switching between date-only and timed deadlines sends both mutually exclusive fields together', () => {
  const source = { ...original, due_date: '2026-11-21', due_at: null }
  const data = existingForm()
  data.set('date', '2026-11-21')
  data.set('time', '18:00')
  const timed = readAssignmentForm(data, source)
  assert.deepEqual(assignmentPatch(timed, source), {
    due_date: null,
    due_at: '2026-11-21T17:00:00.000Z',
  })

  const timedSource = { ...source, due_date: null, due_at: timed.due_at }
  data.set('time', '')
  assert.deepEqual(
    assignmentPatch(readAssignmentForm(data, timedSource), timedSource),
    {
      due_date: '2026-11-21',
      due_at: null,
    },
  )
})

test('uses PATCH and DELETE without client credentials, accepts 204 and reports an unavailable assignment', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return new Response(null, { status: [200, 204, 404][calls.length - 1] })
  })
  await updateAssignment(original.id, { grade: 0 })
  await retireAssignment(original.id)
  await assert.rejects(
    updateAssignment(original.id, { status: 'pending' }),
    AssignmentUnavailableError,
  )
  await updateAssignment(original.id, {})
  assert.equal(calls.length, 3)
  assert.deepEqual(
    calls.map(({ options }) => options.method),
    ['PATCH', 'DELETE', 'PATCH'],
  )
  assert.deepEqual(JSON.parse(calls[0].options.body), { grade: 0 })
  assert.equal(calls[1].options.body, undefined)
  assert.ok(
    calls.every(({ url }) => url === `/api/v1/assignments/${original.id}`),
  )
  assert.ok(
    calls.every(
      ({ options }) => !new Headers(options.headers).has('Authorization'),
    ),
  )
})
