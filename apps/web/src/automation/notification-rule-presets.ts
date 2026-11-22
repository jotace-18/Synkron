import type {
  AutomationRule,
  RuleCondition,
  RuleInput,
} from './automation.types'

export const NOTIFICATION_RULE_PRESETS = [
  { value: 'exam_created', label: 'Se incorpora un examen' },
  { value: 'exam_retired', label: 'Se retira un examen' },
  { value: 'exam_grade_changed', label: 'Cambia la nota de un examen' },
  { value: 'exam_date_changed', label: 'Cambia la fecha de un examen' },
  { value: 'exam_status_changed', label: 'Cambia el estado de un examen' },
  {
    value: 'sync_completed',
    label: 'Una sincronización termina correctamente',
  },
  {
    value: 'sync_failed',
    label: 'Una sincronización falla',
  },
  {
    value: 'grade_changed',
    label: 'Cambia la nota de una entrega',
  },
  {
    value: 'deadline_changed',
    label: 'Cambia el vencimiento de una entrega',
  },
  {
    value: 'assignment_created',
    label: 'Se incorpora una entrega',
  },
  {
    value: 'assignment_retired',
    label: 'Se retira una entrega',
  },
] as const

export type NotificationRulePreset =
  (typeof NOTIFICATION_RULE_PRESETS)[number]['value']

export interface NotificationRuleFormValues {
  name: string
  enabled: boolean
  preset: NotificationRulePreset
  definition_id: string
  message: string
  action_type: 'notify' | 'start_sync'
  target_definition_id: string
}

export function notificationRuleInput(
  values: NotificationRuleFormValues,
): RuleInput {
  const conditions: RuleCondition[] = []

  const syncEvent =
    values.preset === 'sync_completed' || values.preset === 'sync_failed'

  if (syncEvent && values.definition_id) {
    conditions.push({
      field: 'payload.definition_id',
      operator: '==',
      value: values.definition_id,
    })
  }

  if (!syncEvent) {
    conditions.push({
      field: 'payload.activity_type',
      operator: '==',
      value: values.preset.startsWith('exam_') ? 'academic.exam' : 'academic.assignment',
    })

    if (
      values.preset === 'grade_changed' ||
      values.preset === 'deadline_changed' || values.preset === 'exam_grade_changed' || values.preset === 'exam_date_changed' || values.preset === 'exam_status_changed'
    ) {
      conditions.push({
        field: 'payload.changed_fields',
        operator: 'contains',
        value: values.preset.endsWith('grade_changed') ? 'grade' : values.preset === 'exam_status_changed' ? 'status' : 'schedule',
      })
    } else {
      conditions.push({
        field: 'payload.change_type',
        operator: '==',
        value: values.preset.endsWith('_created') ? 'created' : 'retired',
      })
    }
  }

  return {
    name: values.name.trim(),
    enabled: values.enabled,
    trigger: {
      event_type:
        values.preset === 'sync_completed'
          ? 'sync.completed'
          : values.preset === 'sync_failed'
            ? 'sync.failed'
            : 'data.changed',
    },
    condition: {
      mode: 'all',
      conditions,
    },
    actions: [
      values.action_type === 'start_sync'
        ? { type: 'start_sync', definition_id: values.target_definition_id }
        : {
            type: 'notify',
            message: values.message.trim(),
          },
    ],
  }
}

export function readNotificationRule(
  rule: AutomationRule,
): NotificationRuleFormValues | null {
  const action = rule.actions[0]

  if (rule.actions.length !== 1 || !action || rule.condition.mode !== 'all') {
    return null
  }

  const definition = rule.condition.conditions.find(
    (condition) => condition.field === 'payload.definition_id',
  )

  for (const preset of NOTIFICATION_RULE_PRESETS) {
    const values: NotificationRuleFormValues = {
      name: rule.name,
      enabled: rule.enabled,
      preset: preset.value,
      definition_id: definition?.value ?? '',
      message: action.type === 'notify' ? action.message : '',
      action_type: action.type,
      target_definition_id:
        action.type === 'start_sync' ? action.definition_id : '',
    }

    const expected = notificationRuleInput(values)

    const sameConditions =
      expected.condition.conditions.length ===
        rule.condition.conditions.length &&
      expected.condition.conditions.every((condition) =>
        rule.condition.conditions.some(
          (stored) =>
            stored.field === condition.field &&
            stored.operator === condition.operator &&
            stored.value === condition.value,
        ),
      )

    if (
      expected.trigger.event_type === rule.trigger.event_type &&
      sameConditions
    ) {
      return values
    }
  }

  return null
}
