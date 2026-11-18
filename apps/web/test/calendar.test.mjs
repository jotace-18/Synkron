import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activityOccursOn,
  addCalendarDays,
  getMadridDate,
  getMonthDays,
} from '../src/activities/calendar-utils.ts'
import {
  listActivitiesInPeriod,
  SessionExpiredError,
} from '../src/activities/activities-client.ts'

test('preserves date deadlines and places instants and exclusive intervals on Madrid days', () => {
  const days = getMonthDays(2026, 10)
  assert.equal(days.length, 42)
  assert.equal(days[0].date, '2026-10-26')
  assert.equal(addCalendarDays(days.at(-1).date, 1), '2026-12-07')
  assert.equal(getMadridDate(new Date('2026-11-18T23:30:00Z')), '2026-11-19')
  assert.equal(getMadridDate(new Date('2026-07-18T22:30:00Z')), '2026-07-19')

  const deadline = { schedule: { kind: 'date', date: '2026-11-24' } }
  assert.equal(activityOccursOn(deadline, '2026-11-24'), true)
  assert.equal(activityOccursOn(deadline, '2026-11-23'), false)

  const instant = { schedule: { kind: 'instant', at: '2026-11-24T23:30:00Z' } }
  assert.equal(activityOccursOn(instant, '2026-11-25'), true)
  assert.equal(activityOccursOn(instant, '2026-11-24'), false)

  const interval = {
    schedule: {
      kind: 'interval',
      at: '2026-11-24T22:00:00Z',
      end_at: '2026-11-25T23:00:00Z',
    },
  }
  assert.equal(activityOccursOn(interval, '2026-11-24'), true)
  assert.equal(activityOccursOn(interval, '2026-11-25'), true)
  assert.equal(activityOccursOn(interval, '2026-11-26'), false)
})

test('loads every page of the visible period with Madrid bounds and cancellation', async (t) => {
  const calls = []
  const firstPage = Array.from({ length: 50 }, (_, id) => ({ id: String(id) }))
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ query: new URL(url, 'https://localhost').searchParams, options })
    return Response.json(calls.length === 1 ? firstPage : [{ id: '50' }])
  })
  const controller = new AbortController()

  const items = await listActivitiesInPeriod('2026-10-26', '2026-12-07', controller.signal)

  assert.equal(items.length, 51)
  assert.equal(items.at(-1).id, '50')
  assert.deepEqual(calls.map(({ query }) => query.get('offset')), ['0', '50'])
  for (const { query, options } of calls) {
    assert.equal(query.get('from'), '2026-10-26')
    assert.equal(query.get('to'), '2026-12-07')
    assert.equal(query.get('timezone'), 'Europe/Madrid')
    assert.equal(query.get('limit'), '50')
    assert.equal(options.signal, controller.signal)
    assert.equal(options.credentials, 'same-origin')
    assert.equal(options.cache, 'no-store')
  }
})

test('rejects an expired session on a later page instead of showing an incomplete calendar', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1
    return calls === 1
      ? Response.json(Array.from({ length: 50 }, (_, id) => ({ id: String(id) })))
      : new Response(null, { status: 401 })
  })

  await assert.rejects(
    listActivitiesInPeriod('2026-10-26', '2026-12-07'),
    SessionExpiredError,
  )
  assert.equal(calls, 2)
})
