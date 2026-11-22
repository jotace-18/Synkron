import { getCsrfToken } from '../auth/auth-client.ts'
import { SessionExpiredError } from '../activities/activities-client.ts'

export interface SyncDefinition {
  id: string
  name: string
  enabled: boolean
}

export interface RunReference {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
}

export interface SyncRun extends RunReference {
  definition_id: string
  read_count: number
  created_count: number
  updated_count: number
  unchanged_count: number
  retired_count: number
  ignored_count: number
  error_message: string | null
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(10_000)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

function checkSession(response: Response): void {
  if (response.status === 401) throw new SessionExpiredError()
}

export async function listDefinitions(signal?: AbortSignal): Promise<SyncDefinition[]> {
  const definitions: SyncDefinition[] = []
  for (;;) {
    const query = new URLSearchParams({ limit: '50', offset: String(definitions.length) })
    const response = await fetch(`/api/v1/sync-definitions?${query}`, {
      credentials: 'same-origin', cache: 'no-store', signal: requestSignal(signal),
    })
    checkSession(response)
    if (response.status !== 200) throw new Error('No se pudieron cargar las sincronizaciones.')
    const page: unknown = await response.json()
    if (!Array.isArray(page) || page.length > 50 || !page.every((item: unknown) =>
      item !== null && typeof item === 'object' &&
      'id' in item && typeof item.id === 'string' &&
      'name' in item && typeof item.name === 'string' &&
      'enabled' in item && typeof item.enabled === 'boolean')) {
      throw new Error('El servicio ha devuelto una respuesta inesperada.')
    }
    definitions.push(...(page as SyncDefinition[]))
    if (page.length < 50) return definitions
  }
}

function isRunReference(value: unknown): value is RunReference {
  return value !== null && typeof value === 'object' &&
    'id' in value && typeof value.id === 'string' &&
    'status' in value && typeof value.status === 'string' &&
    ['queued', 'running', 'completed', 'failed'].includes(value.status)
}

export async function requestRun(
  definitionId: string,
  requestKey: string,
  signal?: AbortSignal,
): Promise<RunReference> {
  const csrf = await getCsrfToken(requestSignal(signal))
  const response = await fetch(`/api/v1/sync-definitions/${encodeURIComponent(definitionId)}/runs`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: requestSignal(signal),
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': requestKey },
    body: '{}',
  })
  checkSession(response)
  if (response.status === 404) throw new Error('La sincronización ya no está disponible.')
  if (response.status === 409) throw new Error('La sincronización no está disponible. Revisa su configuración.')
  if (response.status === 403) throw new Error('No se pudo autorizar la solicitud. Inténtalo de nuevo.')
  if (response.status !== 202) throw new Error('No se pudo solicitar la sincronización. Puedes reintentar la misma solicitud.')
  const body: unknown = await response.json()
  if (!isRunReference(body)) throw new Error('El servicio ha devuelto una respuesta inesperada.')
  return body
}

export async function getRun(id: string, signal?: AbortSignal): Promise<SyncRun> {
  const response = await fetch(`/api/v1/sync-runs/${encodeURIComponent(id)}`, {
    credentials: 'same-origin', cache: 'no-store', signal: requestSignal(signal),
  })
  checkSession(response)
  if (response.status !== 200) throw new Error('No se pudo consultar el estado. La sincronización puede seguir en curso.')
  const body: unknown = await response.json()
  const countKeys = ['read_count', 'created_count', 'updated_count', 'unchanged_count', 'retired_count', 'ignored_count']
  if (!isRunReference(body) || body.id !== id ||
    !countKeys.every((key) => key in body && Number.isSafeInteger((body as unknown as Record<string, unknown>)[key]) &&
      Number((body as unknown as Record<string, unknown>)[key]) >= 0) ||
    !('error_message' in body) || (body.error_message !== null && typeof body.error_message !== 'string')) {
    throw new Error('El servicio ha devuelto una respuesta inesperada.')
  }
  return body as SyncRun
}
