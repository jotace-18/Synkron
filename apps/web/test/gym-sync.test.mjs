import {
  notificationRuleInput,
  readNotificationRule,
} from '../src/automation/notification-rule-presets.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createBatch, submitBatch } from '../src/sync/sync-batch.ts'
import { getGymFields } from '../src/activities/activity-format.ts'
import { filterActivities } from '../src/activities/activity-filters.ts'
import { SessionExpiredError } from '../src/activities/activities-client.ts'

test('sync all isolates failed requests and reuses keys without resubmitting accepted sources', async () => {
  const entries = createBatch(
    [
      { id: 'academic', name: 'Campus', enabled: true },
      { id: 'sport', name: 'Sport', enabled: true },
      { id: 'disabled', name: 'Disabled', enabled: false },
    ],
    'batch',
  )
  const calls = []
  let fail = true
  const send = async (id, key) => {
    calls.push([id, key])
    if (id === 'academic' && fail) throw new TypeError('lost response')
    return { id: `run-${id}`, status: 'queued' }
  }
  await submitBatch(entries, new AbortController().signal, () => {}, send)
  assert.equal(entries[0].receipt, undefined)
  assert.equal(entries[1].receipt.id, 'run-sport')
  fail = false
  await submitBatch(entries, new AbortController().signal, () => {}, send)
  assert.deepEqual(calls, [
    ['academic', 'batch:academic'],
    ['sport', 'batch:sport'],
    ['academic', 'batch:academic'],
  ])
  assert.equal(entries[0].error, undefined)
})
test('expired sessions stop the batch; abort never dispatches another source', async () => {
  const entries = createBatch(
    [
      { id: 'one', enabled: true },
      { id: 'two', enabled: true },
    ],
    'batch',
  )
  let calls = 0
  await assert.rejects(
    submitBatch(
      entries,
      new AbortController().signal,
      () => {},
      async () => {
        calls++
        throw new SessionExpiredError()
      },
    ),
    SessionExpiredError,
  )
  assert.equal(calls, 1)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    submitBatch(
      entries,
      controller.signal,
      () => {},
      async () => {
        calls++
      },
    ),
  )
  assert.equal(calls, 1)
})
test('gym details derive duration from the interval and state filters include sport without assignments', () => {
  const gym = {
    id: 'gym',
    type: 'sport.gym',
    status: 'scheduled',
    schedule: {
      kind: 'interval',
      at: '2026-11-24T17:00:00Z',
      end_at: '2026-11-24T18:15:00Z',
    },
    details: { training_mode: 'upper', accompanied: true },
  }
  assert.deepEqual(getGymFields(gym), [
    { label: 'Modalidad', value: 'Upper' },
    { label: 'Duración', value: '75 minutos' },
    { label: 'Compañía', value: 'Acompañado' },
  ])
  const items = [
    gym,
    { ...gym, id: 'exam', type: 'academic.exam' },
    {
      ...gym,
      id: 'assignment',
      type: 'academic.assignment',
      status: 'pending',
    },
  ]
  assert.deepEqual(
    filterActivities(items, {
      category: 'all',
      delivery: 'scheduled',
      course: '',
    }).map(({ id }) => id),
    ['gym', 'exam'],
  )
  assert.deepEqual(
    filterActivities(items, {
      category: 'sport',
      delivery: 'scheduled',
      course: '',
    }).map(({ id }) => id),
    ['gym'],
  )
})

test('gym notification templates match gym events and round-trip without changing academic scopes', () => {
  for (const preset of [
    'gym_created',
    'gym_retired',
    'gym_schedule_changed',
    'gym_status_changed',
  ]) {
    const form = {
      name: 'Aviso gimnasio',
      enabled: false,
      preset,
      definition_id: '',
      message: 'Cambio en gimnasio',
      action_type: 'notify',
      target_definition_id: '',
    }
    const rule = notificationRuleInput(form)
    assert.equal(rule.condition.conditions[0].value, 'sport.gym')
    assert.equal(readNotificationRule({ ...rule, id: 'rule' }).preset, preset)
    if (preset === 'gym_status_changed')
      assert.equal(rule.condition.conditions[1].value, 'status')
    if (preset === 'gym_schedule_changed')
      assert.equal(rule.condition.conditions[1].value, 'schedule')
  }
})
