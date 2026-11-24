import assert from 'node:assert/strict'
import test from 'node:test'
import {
  madridDeadline,
  readAssignmentForm,
} from '../src/assignments/assignment-form.ts'
import {
  createAssignment,
  UnconfirmedAssignmentError,
} from '../src/assignments/assignments-client.ts'

function form() {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    title: '  Práctica 2  ',
    course_name: 'Este texto no debe sustituir el nombre del catálogo',
    course_abbreviation: ' CC ',
    section: 'practice',
    status: 'pending',
    work_mode: 'individual',
    date: '2026-11-25',
    time: '',
    grade: '0',
    weight_percent: '',
    weight_basis: 'course',
  }))
    data.set(key, value)
  return data
}

test('preserves a date-only deadline, optional obligation and a zero grade, with consistent group and weight fields', () => {
  const data = form()
  const input = readAssignmentForm(data)
  assert.equal(input.title, 'Práctica 2')
  assert.equal(input.course_abbreviation, 'CC')
  assert.equal(input.course_name, 'Cloud Computing')
  assert.equal(input.due_date, '2026-11-25')
  assert.equal(input.due_at, null)
  assert.equal(input.mandatory, false)
  assert.equal(input.grade, 0)
  assert.equal(input.weight_percent, null)
  assert.equal(input.weight_basis, null)
  assert.deepEqual(input.group_members, [])

  data.set('work_mode', 'group')
  data.set('group_members', '  Ana\n\nLuis  ')
  data.set('weight_percent', '0')
  data.set('weight_basis', 'section')
  const group = readAssignmentForm(data)
  assert.deepEqual(group.group_members, ['Ana', 'Luis'])
  assert.equal(group.weight_percent, 0)
  assert.equal(group.weight_basis, 'section')
})

test('converts Madrid deadlines independently of device time zone and handles daylight-saving transitions', () => {
  assert.equal(
    madridDeadline('2026-11-25', '15:00'),
    '2026-11-25T14:00:00.000Z',
  )
  assert.equal(
    madridDeadline('2026-06-25', '15:00'),
    '2026-06-25T13:00:00.000Z',
  )
  assert.throws(
    () => madridDeadline('2026-03-29', '02:30'),
    /no existe en Madrid/,
  )
  assert.equal(
    madridDeadline('2026-10-25', '02:30'),
    '2026-10-25T00:30:00.000Z',
  )
  assert.throws(() => madridDeadline('2026-02-30', '15:00'), /Revisa la fecha/)
})

test('sends no Bearer from the browser and does not automatically retry an uncertain creation', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === '/api/v1/auth/csrf') return Response.json({csrf_token: 'fresh-csrf'});
    calls += 1
    assert.equal(url, '/api/v1/assignments')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, undefined)
    assert.equal(JSON.parse(options.body).grade, 0)
    if (calls === 1) return new Response(null, { status: 201 })
    throw new TypeError('Connection lost')
  })
  await createAssignment(readAssignmentForm(form()))
  await assert.rejects(
    createAssignment(readAssignmentForm(form())),
    UnconfirmedAssignmentError,
  )
  assert.equal(calls, 2)
})
