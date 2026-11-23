import assert from 'node:assert/strict'
import test from 'node:test'
import { activityOccursOn } from '../src/activities/calendar-utils.ts'
import { formatActivityType } from '../src/activities/activity-format.ts'
import { filterActivities } from '../src/activities/activity-filters.ts'
import { SOURCE_PRESETS } from '../src/sync/source-presets.ts'

test('Personal has a distinct source preset using the existing canonical connector', () => {
  assert.equal(
    SOURCE_PRESETS.personal.connector,
    SOURCE_PRESETS.sport.connector,
  )
  assert.equal(
    SOURCE_PRESETS.personal.url,
    'http://personal:3000/api/v1/activities/export',
  )
  assert.equal(
    SOURCE_PRESETS.sport.url,
    'http://sport:3000/api/v1/activities/export',
  )
  assert.equal(formatActivityType('personal.event'), 'Otros')
  assert.equal(formatActivityType('social.plan'), 'Otros')
})
test('all categories coexist and Personal days and intervals preserve their calendar semantics', () => {
  const event = {
    id: 'personal',
    type: 'personal.event',
    status: 'pending',
    details: { people: ['Ana'] },
    schedule: {
      kind: 'date',
      role: 'start',
      date: '2026-11-25',
      at: null,
      end_at: null,
    },
  }
  assert.equal(activityOccursOn(event, '2026-11-25'), true)
  assert.equal(activityOccursOn(event, '2026-11-24'), false)
  const overnight = {
    ...event,
    schedule: {
      kind: 'interval',
      role: 'start',
      date: null,
      at: '2026-11-25T22:30:00Z',
      end_at: '2026-11-26T00:00:00Z',
    },
  }
  assert.equal(activityOccursOn(overnight, '2026-11-25'), true)
  assert.equal(activityOccursOn(overnight, '2026-11-26'), true)
  const items = [
    event,
    { ...event, id: 'academic', type: 'academic.assignment' },
    { ...event, id: 'sport', type: 'sport.gym' },
    { ...event, id: 'legacy', type: 'social.plan' },
  ]
  const filters = { category: 'all', delivery: 'all', course: '' }
  assert.equal(filterActivities(items, filters).length, 4)
  assert.deepEqual(
    filterActivities(items, { ...filters, category: 'personal' }).map(
      ({ id }) => id,
    ),
    ['personal', 'legacy'],
  )
  assert.deepEqual(
    filterActivities(items, { ...filters, category: 'academic' }).map(
      ({ id }) => id,
    ),
    ['academic'],
  )
  assert.deepEqual(
    filterActivities(items, { ...filters, category: 'sport' }).map(
      ({ id }) => id,
    ),
    ['sport'],
  )
})

test('Personal detail derives duration from the interval and distinguishes missing people from being alone', async () => {
  const { getActivityFields } =
    await import('../src/activities/activity-format.ts')
  const event = {
    type: 'personal.event',
    details: { people: ['Ana', 'Luis'] },
    schedule: {
      kind: 'interval',
      role: 'start',
      date: null,
      at: '2026-11-25T09:00:00Z',
      end_at: '2026-11-25T09:45:00Z',
    },
  }
  assert.deepEqual(getActivityFields(event), [
    { label: 'Duración', value: '45 minutos' },
    { label: 'Personas', value: 'Ana, Luis' },
  ])
  const withoutTime = {
    ...event,
    details: { people: [] },
    schedule: {
      kind: 'date',
      role: 'start',
      date: '2026-11-25',
      at: null,
      end_at: null,
    },
  }
  assert.deepEqual(getActivityFields(withoutTime), [
    { label: 'Duración', value: 'Sin duración indicada' },
    { label: 'Personas', value: 'Sin personas indicadas' },
  ])
  assert.deepEqual(
    getActivityFields({
      ...withoutTime,
      schedule: {
        kind: 'instant',
        role: 'start',
        date: null,
        at: '2026-11-25T09:00:00Z',
        end_at: null,
      },
    }),
    getActivityFields(withoutTime),
  )
  assert.deepEqual(getActivityFields({ ...event, type: 'unknown.event' }), [])
})
test('Personal status filters coexist with assignment delivery and scheduled exam/gym filters', async () => {
  const { getStatusFilterOptions } =
    await import('../src/activities/activity-filters.ts')
  assert.deepEqual(
    getStatusFilterOptions('personal').map(({ value }) => value),
    ['all', 'pending', 'completed', 'cancelled'],
  )
  assert.equal(
    getStatusFilterOptions('sport').some(({ value }) => value === 'submitted'),
    false,
  )
  assert.equal(
    getStatusFilterOptions('academic').some(({ value }) => value === 'pending'),
    false,
  )
  const personal = {
    id: 'personal',
    type: 'personal.event',
    status: 'pending',
    details: { people: [] },
  }
  const items = [
    personal,
    { ...personal, id: 'done', status: 'completed' },
    { ...personal, id: 'cancelled', status: 'cancelled' },
    { ...personal, id: 'assignment', type: 'academic.assignment' },
    { ...personal, id: 'exam', type: 'academic.exam', status: 'scheduled' },
    { ...personal, id: 'gym', type: 'sport.gym', status: 'completed' },
  ]
  const filters = { category: 'personal', delivery: 'pending', course: '' }
  assert.deepEqual(
    filterActivities(items, filters).map(({ id }) => id),
    ['personal'],
  )
  assert.deepEqual(
    filterActivities(items, { ...filters, delivery: 'completed' }).map(
      ({ id }) => id,
    ),
    ['done'],
  )
  assert.deepEqual(
    filterActivities(items, { ...filters, delivery: 'cancelled' }).map(
      ({ id }) => id,
    ),
    ['cancelled'],
  )
  assert.deepEqual(
    filterActivities(items, { ...filters, category: 'all' }).map(
      ({ id }) => id,
    ),
    ['personal', 'assignment'],
  )
  assert.deepEqual(
    filterActivities(items, {
      ...filters,
      category: 'academic',
      delivery: 'unsubmitted',
    }).map(({ id }) => id),
    ['assignment'],
  )
  assert.deepEqual(
    filterActivities(items, {
      ...filters,
      category: 'academic',
      delivery: 'scheduled',
    }).map(({ id }) => id),
    ['exam'],
  )
})
test('Personal notification rules round-trip with their own activity scope and specific changed fields', async () => {
  const { notificationRuleInput, readNotificationRule } =
    await import('../src/automation/notification-rule-presets.ts')
  const cases = {
    personal_created: ['payload.change_type', 'created'],
    personal_retired: ['payload.change_type', 'retired'],
    personal_schedule_changed: ['payload.changed_fields', 'schedule'],
    personal_status_changed: ['payload.changed_fields', 'status'],
    personal_people_changed: ['payload.changed_fields', 'people'],
    personal_title_changed: ['payload.changed_fields', 'title'],
  }
  for (const [preset, [field, value]] of Object.entries(cases)) {
    const form = {
      name: 'Aviso de Otros',
      enabled: false,
      preset,
      definition_id: '',
      message: 'Cambio en un compromiso',
      action_type: 'notify',
      target_definition_id: '',
    }
    const rule = notificationRuleInput(form)
    assert.equal(rule.trigger.event_type, 'data.changed')
    assert.deepEqual(rule.condition.conditions[0], {
      field: 'payload.activity_type',
      operator: '==',
      value: 'personal.event',
    })
    assert.deepEqual(rule.condition.conditions[1], {
      field,
      operator: field === 'payload.changed_fields' ? 'contains' : '==',
      value,
    })
    assert.deepEqual(rule.actions, [
      { type: 'notify', message: 'Cambio en un compromiso' },
    ])
    assert.equal(readNotificationRule({ ...rule, id: 'rule' }).preset, preset)
    const starts = notificationRuleInput({
      ...form,
      action_type: 'start_sync',
      target_definition_id: 'target',
    })
    assert.equal(
      readNotificationRule({ ...starts, id: 'rule' }).target_definition_id,
      'target',
    )
  }
})
