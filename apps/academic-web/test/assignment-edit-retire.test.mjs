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
    if (url === '/api/v1/auth/csrf') return Response.json({csrf_token: 'fresh-csrf'});
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

test('quick submission writes only the submitted status and preserves the rest of the record', async (t) => {
  const source = { ...original, status: 'pending' }
  const calls = []
  let saved = source
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === '/api/v1/auth/csrf') return Response.json({ csrf_token: 'fresh-csrf' })
    calls.push({ url, options })
    saved = { ...saved, ...JSON.parse(options.body) }
    return Response.json(saved)
  })
  await updateAssignment(source.id, { status: 'submitted' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.method, 'PATCH')
  assert.equal(calls[0].url, `/api/v1/assignments/${source.id}`)
  assert.deepEqual(JSON.parse(calls[0].options.body), { status: 'submitted' })
  assert.deepEqual(saved, { ...source, status: 'submitted' })
})

test('a lost submission response reports uncertainty without automatically repeating the write', async (t) => {
  const { UnconfirmedAssignmentError } = await import('../src/assignments/assignments-client.ts')
  let writes = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === '/api/v1/auth/csrf') return Response.json({ csrf_token: 'fresh-csrf' })
    writes += 1
    throw new TypeError('Network connection lost')
  })
  await assert.rejects(updateAssignment(original.id, { status: 'submitted' }), UnconfirmedAssignmentError)
  assert.equal(writes, 1)
})

test('creating from a course uses its identity by default and still allows selecting another course', () => {
  const cc = { course_name: 'Cloud Computing', course_abbreviation: 'CC' }
  const data = existingForm()
  data.set('title', 'Nueva práctica')
  data.set('course_abbreviation', assignmentCourseCode(cc))
  data.set('status', 'pending')
  data.set('work_mode', 'individual')
  const input = readAssignmentForm(data, undefined, cc)
  assert.equal(input.course_name, cc.course_name)
  assert.equal(input.course_abbreviation, 'CC')
  assert.equal(input.title, 'Nueva práctica')
  assert.equal(input.status, 'pending')
  assert.equal('id' in input, false)

  data.set('course_abbreviation', 'TID')
  const changed = readAssignmentForm(data, undefined, cc)
  assert.equal(changed.course_name, 'Tratamiento Inteligente de Datos')
  assert.equal(changed.course_abbreviation, 'TID')
})

test('creating from a course outside the catalog preserves its name and optional abbreviation', () => {
  for (const abbreviation of ['OPT', null]) {
    const custom = { course_name: 'Optativa antigua', course_abbreviation: abbreviation }
    const data = existingForm()
    data.set('course_abbreviation', assignmentCourseCode(custom))
    const input = readAssignmentForm(data, undefined, custom)
    assert.equal(input.course_name, custom.course_name)
    assert.equal(input.course_abbreviation, abbreviation)
  }
  const data = existingForm()
  assert.throws(() => readAssignmentForm(data), /Selecciona una asignatura/)
  assert.equal(assignmentCourseCode(), '')
})
