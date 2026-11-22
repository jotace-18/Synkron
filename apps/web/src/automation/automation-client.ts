import { SessionExpiredError } from '../activities/activities-client'
import { getCsrfToken } from '../auth/auth-client'
import type {
  AutomationHistoryEntry,
  AutomationHistoryKind,
  AutomationHistoryStatus,
  ReminderSettings,
  ReminderSettingsInput,
  ReminderSettingsResponse,
  AutomationSchedule,
  ScheduleInput,
  AutomationRule,
  RuleInput,
} from './automation.types'

const SETTINGS_URL = '/api/v1/automation/reminders/settings'

export const HISTORY_PAGE_SIZE = 20

export async function listAutomationHistory(
  kind: AutomationHistoryKind | 'all',
  status: AutomationHistoryStatus | 'all',
  offset: number,
  signal?: AbortSignal,
): Promise<AutomationHistoryEntry[]> {
  const query = new URLSearchParams({
    limit: String(HISTORY_PAGE_SIZE),
    offset: String(offset),
  })
  if (kind !== 'all') query.set('kind', kind)
  if (status !== 'all') query.set('status', status)
  const response = await requestAutomation(
    `/api/v1/automation/history?${query}`,
    {},
    signal,
  )
  if (response.status !== 200)
    throw new Error('No se pudo cargar el historial de automatizaciones.')
  const body: unknown = await response.json()
  if (
    !Array.isArray(body) ||
    body.length > HISTORY_PAGE_SIZE ||
    !body.every((item: unknown) => {
      if (!isRecord(item)) return false
      return (
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        ['schedule', 'rule', 'reminder'].includes(String(item.kind)) &&
        ['notify', 'start_sync'].includes(String(item.action_type)) &&
        ['pending', 'accepted', 'failed', 'blocked', 'cancelled'].includes(
          String(item.status),
        ) &&
        isTimestamp(item.created_at) &&
        (item.resolved_at === null || isTimestamp(item.resolved_at)) &&
        (item.next_attempt_at === null || isTimestamp(item.next_attempt_at)) &&
        typeof item.attempt_count === 'number' &&
        Number.isSafeInteger(item.attempt_count) &&
        item.attempt_count >= 0 &&
        [
          'error_code',
          'error_message',
          'result_id',
          'sync_run_id',
          'activity_id',
        ].every((key) => item[key] === null || typeof item[key] === 'string')
      )
    })
  )
    throw new Error('El servicio ha devuelto un historial inesperado.')
  return body as AutomationHistoryEntry[]
}

async function requestAutomation(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<Response> {
  const timeout = AbortSignal.timeout(10_000)

  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })

  if (response.status === 401) {
    throw new SessionExpiredError()
  }

  return response
}

function readSettings(value: unknown): ReminderSettings {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('enabled' in value) ||
    typeof value.enabled !== 'boolean' ||
    !('lead_minutes' in value) ||
    (value.lead_minutes !== 60 && value.lead_minutes !== 1440) ||
    !('created_at' in value) ||
    typeof value.created_at !== 'string' ||
    !Number.isFinite(Date.parse(value.created_at)) ||
    !('updated_at' in value) ||
    typeof value.updated_at !== 'string' ||
    !Number.isFinite(Date.parse(value.updated_at))
  ) {
    throw new Error('El servicio ha devuelto una respuesta inesperada.')
  }

  return {
    id: value.id,
    enabled: value.enabled,
    lead_minutes: value.lead_minutes,
    created_at: value.created_at,
    updated_at: value.updated_at,
  }
}

export async function getReminderSettings(
  signal?: AbortSignal,
): Promise<ReminderSettingsResponse> {
  const response = await requestAutomation(SETTINGS_URL, {}, signal)

  if (response.status !== 200) {
    throw new Error('No se pudo cargar la configuración de recordatorios.')
  }

  const body: unknown = await response.json()

  if (typeof body !== 'object' || body === null || !('settings' in body)) {
    throw new Error('El servicio ha devuelto una respuesta inesperada.')
  }

  return {
    settings: body.settings === null ? null : readSettings(body.settings),
  }
}

export async function saveReminderSettings(
  input: ReminderSettingsInput,
): Promise<ReminderSettings> {
  const csrfToken = await getCsrfToken()

  const response = await requestAutomation(SETTINGS_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(input),
  })

  if (response.status === 422) {
    throw new Error('Revisa la configuración antes de guardar.')
  }

  if (response.status !== 200) {
    throw new Error('No se pudo guardar la configuración de recordatorios.')
  }

  const body: unknown = await response.json()
  return readSettings(body)
}

const SCHEDULES_URL = '/api/v1/automation/schedules'

export const SCHEDULE_PAGE_SIZE = 20

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function readSchedule(value: unknown): AutomationSchedule {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('El servicio ha devuelto una programación inesperada.')
  }

  const item = value as Record<string, unknown>

  const validTiming =
    (item.schedule_kind === 'interval' &&
      [15, 30, 60].includes(Number(item.interval_minutes)) &&
      typeof item.interval_minutes === 'number' &&
      item.daily_time === null) ||
    (item.schedule_kind === 'daily' &&
      item.interval_minutes === null &&
      typeof item.daily_time === 'string' &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(item.daily_time))

  if (
    typeof item.id !== 'string' ||
    typeof item.name !== 'string' ||
    typeof item.definition_id !== 'string' ||
    typeof item.enabled !== 'boolean' ||
    item.timezone !== 'Europe/Madrid' ||
    !validTiming ||
    !isTimestamp(item.created_at) ||
    !isTimestamp(item.updated_at) ||
    (item.next_run_at !== null && !isTimestamp(item.next_run_at)) ||
    item.enabled !== (item.next_run_at !== null)
  ) {
    throw new Error('El servicio ha devuelto una programación inesperada.')
  }

  return value as AutomationSchedule
}

export async function listSchedules(
  offset = 0,
  signal?: AbortSignal,
): Promise<AutomationSchedule[]> {
  const query = new URLSearchParams({
    limit: String(SCHEDULE_PAGE_SIZE),
    offset: String(offset),
  })

  const response = await requestAutomation(
    `${SCHEDULES_URL}?${query}`,
    {},
    signal,
  )

  if (response.status !== 200) {
    throw new Error('No se pudieron cargar las programaciones.')
  }

  const body: unknown = await response.json()

  if (!Array.isArray(body) || body.length > SCHEDULE_PAGE_SIZE) {
    throw new Error('El servicio ha devuelto una respuesta inesperada.')
  }

  return body.map(readSchedule)
}

export async function saveSchedule(
  input: ScheduleInput,
  id?: string,
): Promise<AutomationSchedule> {
  const csrfToken = await getCsrfToken()

  const response = await requestAutomation(
    id ? `${SCHEDULES_URL}/${encodeURIComponent(id)}` : SCHEDULES_URL,
    {
      method: id ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        name: input.name,
        definition_id: input.definition_id,
        enabled: input.enabled,
        schedule_kind: input.schedule_kind,
        interval_minutes: input.interval_minutes,
        daily_time: input.daily_time,
      }),
    },
  )

  if (response.status === 404) {
    throw new Error(
      'La programación o la sincronización ya no está disponible.',
    )
  }

  if (response.status === 409) {
    throw new Error(
      'La sincronización no está disponible. Revisa su configuración.',
    )
  }

  if (response.status === 422) {
    throw new Error('Revisa el nombre, la sincronización y el horario.')
  }

  if (response.status !== (id ? 200 : 201)) {
    throw new Error('No se pudo confirmar el guardado de la programación.')
  }

  const body: unknown = await response.json()
  const schedule = readSchedule(body)

  if (id && schedule.id !== id) {
    throw new Error('El servicio ha devuelto una programación inesperada.')
  }

  return schedule
}

const RULES_URL = '/api/v1/automation/rules'

export const RULE_PAGE_SIZE = 20

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRuleCondition(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.field !== 'string' ||
    typeof value.value !== 'string'
  ) {
    return false
  }

  if (value.field === 'payload.changed_fields') {
    return value.operator === 'contains'
  }

  if (value.field === 'payload.change_type') {
    return (
      value.operator === '==' &&
      ['created', 'updated', 'retired'].includes(value.value)
    )
  }

  return (
    value.operator === '==' &&
    [
      'payload.activity_type',
      'payload.source_connection_id',
      'payload.definition_id',
      'payload.error.code',
    ].includes(value.field)
  )
}

function isRuleAction(value: unknown): boolean {
  if (!isRecord(value)) return false

  if (value.type === 'notify') {
    return typeof value.message === 'string' && value.message.trim().length > 0
  }

  return value.type === 'start_sync' && typeof value.definition_id === 'string'
}

function readRule(value: unknown): AutomationRule {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.enabled !== 'boolean' ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at) ||
    !isRecord(value.trigger) ||
    typeof value.trigger.event_type !== 'string' ||
    !['data.changed', 'sync.completed', 'sync.failed'].includes(
      value.trigger.event_type,
    ) ||
    !isRecord(value.condition) ||
    (value.condition.mode !== 'all' && value.condition.mode !== 'any') ||
    !Array.isArray(value.condition.conditions) ||
    value.condition.conditions.length > 10 ||
    !value.condition.conditions.every(isRuleCondition) ||
    !Array.isArray(value.actions) ||
    value.actions.length < 1 ||
    value.actions.length > 5 ||
    !value.actions.every(isRuleAction)
  ) {
    throw new Error('El servicio ha devuelto una regla inesperada.')
  }

  return value as unknown as AutomationRule
}

export async function listRules(
  offset = 0,
  signal?: AbortSignal,
): Promise<AutomationRule[]> {
  const query = new URLSearchParams({
    limit: String(RULE_PAGE_SIZE),
    offset: String(offset),
  })

  const response = await requestAutomation(`${RULES_URL}?${query}`, {}, signal)

  if (response.status !== 200) {
    throw new Error('No se pudieron cargar las reglas.')
  }

  const body: unknown = await response.json()

  if (!Array.isArray(body) || body.length > RULE_PAGE_SIZE) {
    throw new Error('El servicio ha devuelto una respuesta inesperada.')
  }

  return body.map(readRule)
}

export async function saveRule(
  input: RuleInput,
  id?: string,
): Promise<AutomationRule> {
  const csrfToken = await getCsrfToken()

  const response = await requestAutomation(
    id ? `${RULES_URL}/${encodeURIComponent(id)}` : RULES_URL,
    {
      method: id ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        name: input.name,
        enabled: input.enabled,
        trigger: input.trigger,
        condition: input.condition,
        actions: input.actions,
      }),
    },
  )

  if (response.status === 404) {
    throw new Error('La regla o su sincronización ya no está disponible.')
  }

  if (response.status === 409) {
    throw new Error('Revisa las sincronizaciones utilizadas por la regla.')
  }

  if (response.status === 422) {
    throw new Error('Revisa el nombre, las condiciones y las acciones.')
  }

  if (response.status !== (id ? 200 : 201)) {
    throw new Error('No se pudo confirmar el guardado de la regla.')
  }

  const body: unknown = await response.json()
  const rule = readRule(body)

  if (id && rule.id !== id) {
    throw new Error('El servicio ha devuelto una regla inesperada.')
  }

  return rule
}
