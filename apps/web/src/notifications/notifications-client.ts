import { SessionExpiredError } from '../activities/activities-client'
import { getCsrfToken } from '../auth/auth-client'
import type { NotificationFilter, UserNotification } from './notification.types'

export const NOTIFICATIONS_PAGE_SIZE = 20

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function readNotification(value: unknown): UserNotification {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    typeof value.message !== 'string' ||
    !timestamp(value.created_at) ||
    (value.read_at !== null && !timestamp(value.read_at)) ||
    !record(value.source)
  ) {
    throw new Error('El servicio ha devuelto un aviso inesperado.')
  }
  const source = value.source
  const validSource =
    source.kind === 'rule'
      ? typeof source.rule_id === 'string' &&
        typeof source.event_id === 'string' &&
        typeof source.sync_run_id === 'string' &&
        (source.activity_id === undefined ||
          typeof source.activity_id === 'string')
      : source.kind === 'reminder' &&
        typeof source.reminder_id === 'string' &&
        typeof source.activity_id === 'string' &&
        typeof source.deadline_key === 'string'
  if (!validSource)
    throw new Error('El servicio ha devuelto un aviso inesperado.')
  return value as unknown as UserNotification
}

async function request(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
) {
  const timeout = AbortSignal.timeout(10_000)
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (response.status === 401) throw new SessionExpiredError()
  return response
}

export async function listNotifications(
  status: NotificationFilter,
  offset: number,
  signal?: AbortSignal,
): Promise<UserNotification[]> {
  const query = new URLSearchParams({
    limit: String(NOTIFICATIONS_PAGE_SIZE),
    offset: String(offset),
  })
  if (status !== 'all') query.set('status', status)
  const response = await request(`/api/v1/notifications?${query}`, {}, signal)
  if (response.status !== 200)
    throw new Error('No se pudieron cargar los avisos.')
  const body: unknown = await response.json()
  if (!Array.isArray(body) || body.length > NOTIFICATIONS_PAGE_SIZE)
    throw new Error('Respuesta inesperada.')
  return body.map(readNotification)
}

export async function getUnreadCount(signal?: AbortSignal): Promise<number> {
  const response = await request(
    '/api/v1/notifications/unread-count',
    {},
    signal,
  )
  if (response.status !== 200)
    throw new Error('No se pudo actualizar el contador.')
  const body: unknown = await response.json()
  if (
    !record(body) ||
    typeof body.unread !== 'number' ||
    !Number.isSafeInteger(body.unread) ||
    body.unread < 0
  ) {
    throw new Error('Respuesta inesperada.')
  }
  return body.unread
}

export async function markNotificationRead(
  id: string,
): Promise<UserNotification> {
  const csrf = await getCsrfToken()
  const response = await request(
    `/api/v1/notifications/${encodeURIComponent(id)}/read`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: '{}',
    },
  )
  if (response.status !== 200)
    throw new Error('No se pudo confirmar la lectura del aviso.')
  const notification = readNotification(await response.json())
  if (notification.id !== id || notification.read_at === null)
    throw new Error('Respuesta inesperada.')
  return notification
}
