import { useEffect, useState } from 'react'
import {
  listAllActivities,
  SessionExpiredError,
} from './activities-client'
import { formatSchedule, formatStatus } from './activity-format'
import type { Activity } from './activity.types'
import {
  DEFAULT_ACTIVITY_FILTERS, filterActivities, getCourseOptions,
} from './activity-filters'
import type { ActivityFilters } from './activity-filters'

interface ActivitiesListProps {
  onSessionExpired: () => void
  onSelect: (id: string) => void
  refreshVersion?: number
}

export default function ActivitiesList({
  onSessionExpired,
  onSelect,
  refreshVersion = 0,
}: ActivitiesListProps) {
  const [result, setResult] = useState<{
    version: string; activities: Activity[]; error: string | null
  } | null>(null)
  const [retry, setRetry] = useState(0)
  const version = `${refreshVersion}/${retry}`
  const loading = result?.version !== version
  const activities = loading ? [] : result.activities
  const error = loading ? null : result.error

  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_ACTIVITY_FILTERS)

  const visibleActivities = filterActivities(activities, filters)
  const courseOptions = getCourseOptions(activities)
  if (filters.course && !courseOptions.some(({ value }) => value === filters.course)) {
    courseOptions.unshift({ value: filters.course, label: filters.course })
  }
  const hasFilters = filters.category !== 'all' || filters.delivery !== 'all' || filters.course !== ''

  useEffect(() => {
    const controller = new AbortController()

    listAllActivities(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return

        setResult({ version, activities: items, error: null })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return

        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }

        setResult({ version, activities: [], error: 'No se pudieron cargar las actividades. Inténtalo de nuevo.' })
      })

    return () => controller.abort()
  }, [onSessionExpired, version])

  return (
    <section className="activities-panel" aria-labelledby="activities-title" aria-busy={loading}>
      <h2 id="activities-title">Tus actividades</h2>

      <div className="agenda-filters" role="group" aria-label="Filtros de actividades">
        <label className="agenda-filter">
          <span>Tipo</span>
          <select
            value={filters.category}
            onChange={(event) => {
              const category = event.target.value as ActivityFilters['category']
              setFilters((current) => ({
                category,
                course: '',
                delivery: category === 'sport' || category === 'social' ? 'all' : current.delivery,
              }))
            }}
          >
            <option value="all">Todos los tipos</option>
            <option value="academic">Académico</option>
            <option value="sport">Deporte</option>
            <option value="social">Planes</option>
          </select>
        </label>

        {filters.category !== 'social' && (
          <label className="agenda-filter">
            <span>Estado</span>
            <select
              value={filters.delivery}
              onChange={(event) => setFilters((current) => ({
                ...current,
                delivery: event.target.value as ActivityFilters['delivery'],
              }))}
            >
              <option value="all">Cualquier estado</option>
              {filters.category !== 'sport' && <><option value="submitted">Entregadas</option><option value="unsubmitted">No entregadas</option></>}
              <option value="scheduled">Programados</option>
              <option value="completed">Realizados</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </label>
        )}

        {filters.category === 'academic' && (
          <label className="agenda-filter">
            <span>Asignatura</span>
            <select
              value={filters.course}
              onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}
            >
              <option value="">Todas las asignaturas</option>
              {courseOptions.map(({ value, label: courseLabel }) => (
                <option key={value} value={value}>{courseLabel}</option>
              ))}
            </select>
          </label>
        )}

        {hasFilters && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => setFilters(DEFAULT_ACTIVITY_FILTERS)}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <p role="status">Cargando actividades…</p>
      ) : error ? (
        <div>
          <p className="form-error" role="alert">{error}</p>
          <button className="secondary-button" type="button" onClick={() => setRetry((value) => value + 1)}>
            Reintentar
          </button>
        </div>
      ) : activities.length === 0 ? (
        <p role="status">Todavía no tienes actividades sincronizadas.</p>
      ) : visibleActivities.length === 0 ? (
        <p role="status">No hay actividades que coincidan con estos filtros.</p>
      ) : (
        <ul className="activities-list">
          {visibleActivities.map((activity) => (
            <li className="activity-card" key={activity.id}>
              <h3>
                <button className="activity-open" type="button" aria-haspopup="dialog" onClick={() => onSelect(activity.id)}>
                  {activity.title}
                </button>
              </h3>
              <p>{formatSchedule(activity.schedule)}</p>
              <p>{formatStatus(activity.status)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
