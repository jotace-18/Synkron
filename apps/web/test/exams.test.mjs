import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getExamFields,
  formatStatus,
} from '../src/activities/activity-format.ts'
import {
  notificationRuleInput,
  readNotificationRule,
} from '../src/automation/notification-rule-presets.ts'

test('exam details and explicit exam rules preserve assignment scopes', () => {
  const fields = Object.fromEntries(
    getExamFields({
      details: {
        course_name: 'Cloud Computing',
        course_abbreviation: 'CC',
        topics: 'Temas 1 y 2',
        section: 'theory',
        grade: 0,
      },
    }).map((f) => [f.label, f.value]),
  )
  assert.equal(fields.Temario, 'Temas 1 y 2')
  assert.equal(fields.Nota, '0 / 10')
  assert.equal(fields.Obligatoriedad, undefined)
  assert.equal(formatStatus('cancelled'), 'Cancelado')
  const form = {
    name: 'Nota',
    enabled: false,
    preset: 'exam_grade_changed',
    definition_id: '',
    message: 'Nota publicada',
    action_type: 'notify',
    target_definition_id: '',
  }
  const rule = notificationRuleInput(form)
  assert.equal(rule.condition.conditions[0].value, 'academic.exam')
  assert.equal(rule.condition.conditions[1].value, 'grade')
  assert.equal(
    readNotificationRule({ ...rule, id: 'rule' }).preset,
    'exam_grade_changed',
  )
  assert.equal(
    notificationRuleInput({ ...form, preset: 'grade_changed' }).condition
      .conditions[0].value,
    'academic.assignment',
  )
})
