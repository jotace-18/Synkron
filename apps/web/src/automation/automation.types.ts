export type ReminderLeadMinutes = 60 | 1440

export interface ReminderSettingsInput {
  enabled: boolean
  lead_minutes: ReminderLeadMinutes
}

export interface ReminderSettings extends ReminderSettingsInput {
  id: string
  created_at: string
  updated_at: string
}

export interface ReminderSettingsResponse {
  settings: ReminderSettings | null
}

export type ScheduleTiming =
  | {
      schedule_kind: 'interval'
      interval_minutes: 15 | 30 | 60
      daily_time: null
    }
  | {
      schedule_kind: 'daily'
      interval_minutes: null
      daily_time: string
    }

export type ScheduleInput = ScheduleTiming & {
  name: string
  definition_id: string
  enabled: boolean
}

export type AutomationSchedule = ScheduleInput & {
  id: string
  timezone: 'Europe/Madrid'
  next_run_at: string | null
  created_at: string
  updated_at: string
}

export type RuleEventType = 'data.changed' | 'sync.completed' | 'sync.failed'

export type RuleCondition =
  | {
      field: 'payload.change_type'
      operator: '=='
      value: 'created' | 'updated' | 'retired'
    }
  | {
      field:
        | 'payload.activity_type'
        | 'payload.source_connection_id'
        | 'payload.definition_id'
        | 'payload.error.code'
      operator: '=='
      value: string
    }
  | {
      field: 'payload.changed_fields'
      operator: 'contains'
      value: string
    }

export interface RuleConditionGroup {
  mode: 'all' | 'any'
  conditions: RuleCondition[]
}

export type RuleAction =
  | {
      type: 'notify'
      message: string
    }
  | {
      type: 'start_sync'
      definition_id: string
    }

export interface RuleInput {
  name: string
  enabled: boolean
  trigger: {
    event_type: RuleEventType
  }
  condition: RuleConditionGroup
  actions: RuleAction[]
}

export interface AutomationRule extends RuleInput {
  id: string
  revision: number
  created_at: string
  updated_at: string
}

export type AutomationHistoryKind = 'schedule' | 'rule' | 'reminder'
export type AutomationHistoryStatus =
  'pending' | 'accepted' | 'failed' | 'blocked' | 'cancelled'

export interface AutomationHistoryEntry {
  id: string
  kind: AutomationHistoryKind
  name: string
  action_type: 'notify' | 'start_sync'
  status: AutomationHistoryStatus
  created_at: string
  resolved_at: string | null
  next_attempt_at: string | null
  attempt_count: number
  error_code: string | null
  error_message: string | null
  result_id: string | null
  sync_run_id: string | null
  activity_id: string | null
}
