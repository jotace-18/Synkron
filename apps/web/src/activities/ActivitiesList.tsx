import { useEffect, useState } from 'react'
import {
  listActivities,
  SessionExpiredError,
} from './activities-client'
import { formatSchedule, formatStatus } from './activity-format'
import type { Activity } from './activity.types'

interface ActivitiesListProps {
  onSessionExpired: () => void
  onSelect: (id: string) => void
}

export default function ActivitiesList({
  onSessionExpired,
  onSelect,
}: ActivitiesListProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    listActivities(0, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return

        setActivities(items)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return

        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }

        setError('No se pudieron cargar las actividades. Inténtalo de nuevo.')
        setLoading(false)
      })

    return () => controller.abort()
  }, [onSessionExpired])

  return (
    <section className="activities-panel" aria-labelledby="activities-title">
      <h2 id="activities-title">Tus actividades</h2>

      {loading ? (
        <p role="status">Cargando actividades…</p>
      ) : error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : activities.length === 0 ? (
        <p>Todavía no tienes actividades sincronizadas.</p>
      ) : (
        <ul className="activities-list">
          {activities.map((activity) => (
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
