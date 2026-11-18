import type { Activity } from './activity.types'

export class SessionExpiredError extends Error {
  constructor() {
    super('Tu sesión ha caducado. Inicia sesión de nuevo.')
    this.name = 'SessionExpiredError'
  }
}

async function requestActivities(
  path: string,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  })

  if (response.status === 401) {
    throw new SessionExpiredError()
  }

  return response
}

export async function listActivities(
  offset = 0,
  signal?: AbortSignal,
): Promise<Activity[]> {
  const query = new URLSearchParams({
    limit: '20',
    offset: String(offset),
  })

  const response = await requestActivities(
    `/api/v1/activities?${query}`,
    signal,
  )

  if (response.status !== 200) {
    throw new Error('No se pudieron cargar las actividades.')
  }

  return response.json() as Promise<Activity[]>
}

export async function getActivity(
  id: string,
  signal?: AbortSignal,
): Promise<Activity | null> {
  const response = await requestActivities(
    `/api/v1/activities/${encodeURIComponent(id)}`,
    signal,
  )

  if (response.status === 404) {
    return null
  }

  if (response.status !== 200) {
    throw new Error('No se pudo cargar la actividad.')
  }

  return response.json() as Promise<Activity>
}

export async function listActivitiesInPeriod(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<Activity[]> {
  const activities: Activity[] = []
  const pageSize = 50

  for (;;) {
    const query = new URLSearchParams({
      from,
      to,
      timezone: 'Europe/Madrid',
      limit: String(pageSize),
      offset: String(activities.length),
    })

    const response = await requestActivities(
      `/api/v1/activities?${query}`,
      signal,
    )

    if (response.status !== 200) {
      throw new Error('No se pudieron cargar las actividades del calendario.')
    }

    const page: unknown = await response.json()
    if (!Array.isArray(page) || page.length > pageSize) {
      throw new Error('El servicio ha devuelto una respuesta inesperada.')
    }

    activities.push(...(page as Activity[]))
    if (page.length < pageSize) return activities
  }
}
