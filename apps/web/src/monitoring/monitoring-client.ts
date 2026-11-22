import { SessionExpiredError } from '../activities/activities-client'
import type {
  MonitoringRun,
  MonitoringRunDetail,
  MonitoringRunStatus,
  MonitoringSummary,
} from './monitoring.types'

export const MONITORING_PAGE_SIZE = 20

async function requestMonitoring(
  path: string,
  signal?: AbortSignal,
): Promise<Response> {
  const timeout = AbortSignal.timeout(10_000)

  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signal
      ? AbortSignal.any([signal, timeout])
      : timeout,
  })

  if (response.status === 401) {
    throw new SessionExpiredError()
  }

  return response
}

export async function getMonitoringSummary(
  signal?: AbortSignal,
): Promise<MonitoringSummary> {
  const response = await requestMonitoring(
    '/api/v1/monitoring/summary',
    signal,
  )

  if (response.status !== 200) {
    throw new Error('No se pudo cargar el resumen.')
  }

  return response.json() as Promise<MonitoringSummary>
}

export async function listMonitoringRuns(
  status: MonitoringRunStatus | 'all' = 'all',
  offset = 0,
  signal?: AbortSignal,
): Promise<MonitoringRun[]> {
  const query = new URLSearchParams({
    limit: String(MONITORING_PAGE_SIZE),
    offset: String(offset),
  })

  if (status !== 'all') {
    query.set('status', status)
  }

  const response = await requestMonitoring(
    `/api/v1/monitoring/runs?${query}`,
    signal,
  )

  if (response.status !== 200) {
    throw new Error('No se pudo cargar el historial.')
  }

  const body: unknown = await response.json()

  if (!Array.isArray(body) || body.length > MONITORING_PAGE_SIZE) {
    throw new Error('El servicio ha devuelto una respuesta inesperada.')
  }

  return body as MonitoringRun[]
}

export async function getMonitoringRun(
  id: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<MonitoringRunDetail | null> {
  const query = new URLSearchParams({
    limit: String(MONITORING_PAGE_SIZE),
    offset: String(offset),
  })

  const response = await requestMonitoring(
    `/api/v1/monitoring/runs/${encodeURIComponent(id)}?${query}`,
    signal,
  )

  if (response.status === 404) {
    return null
  }

  if (response.status !== 200) {
    throw new Error('No se pudo cargar el detalle de la ejecución.')
  }

  return response.json() as Promise<MonitoringRunDetail>
}