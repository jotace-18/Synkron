import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCalendarTitle, getAssignmentFields } from '../src/activities/activity-format.ts'
import { getActivity, SessionExpiredError } from '../src/activities/activities-client.ts'

test('keeps the course abbreviation in the event and preserves optional, zero and group values in its detail', () => {
  const activity = {
    title: 'Práctica 2',
    details: {
      course_name: 'Cloud Computing',
      course_abbreviation: 'CC',
      section: 'practice',
      mandatory: false,
      work_mode: 'group',
      group_members: ['Ana', 'Luis'],
      weight_percent: 0,
      weight_basis: 'section',
      grade: 0,
    },
  }
  assert.equal(formatCalendarTitle(activity), 'Práctica 2 (CC)')
  const fields = Object.fromEntries(getAssignmentFields(activity).map(({ label, value }) => [label, value]))
  assert.equal(fields.Asignatura, 'Cloud Computing (CC)')
  assert.equal(fields.Parte, 'Prácticas')
  assert.equal(fields.Obligatoriedad, 'Opcional')
  assert.equal(fields.Integrantes, 'Ana, Luis')
  assert.equal(fields.Ponderación, '0 % de la parte de prácticas')
  assert.equal(fields.Nota, '0 / 10')

  activity.details.course_abbreviation = null
  activity.details.grade = null
  assert.equal(formatCalendarTitle(activity), 'Práctica 2')
  assert.equal(getAssignmentFields(activity).find(({ label }) => label === 'Nota').value, 'Sin nota')
})

test('distinguishes an unavailable activity from an expired session when opening its detail', async (t) => {
  const id = '23737e89-ac3f-4b13-8832-d7eab8d65f52'
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return new Response(null, { status: calls.length === 1 ? 404 : 401 })
  })

  assert.equal(await getActivity(id), null)
  await assert.rejects(getActivity(id), SessionExpiredError)
  assert.ok(calls.every(({ url }) => url === `/api/v1/activities/${id}`))
  assert.ok(calls.every(({ options }) => options.credentials === 'same-origin'))
  assert.ok(calls.every(({ options }) => options.cache === 'no-store'))
})
