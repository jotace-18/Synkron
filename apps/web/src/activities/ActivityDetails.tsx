import { useEffect, useRef, useState } from 'react'
import { getActivity, SessionExpiredError } from './activities-client'
import {
  formatActivityType,
  formatSchedule,
  formatStatus,
  getActivityFields,
} from './activity-format'
import type { Activity } from './activity.types'

interface ActivityDetailsProps {
  activityId: string
  onClose: () => void
  onSessionExpired: () => void
}

const timestampFormatter = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
})

export default function ActivityDetails({
  activityId,
  onClose,
  onSessionExpired,
}: ActivityDetailsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current
    const returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    dialog?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
      if (returnFocus?.isConnected) returnFocus.focus()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getActivity(activityId, controller.signal)
      .then((item) => {
        if (controller.signal.aborted) return
        setActivity(item)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }
        setError('No se pudo cargar el detalle de la actividad.')
        setLoading(false)
      })
    return () => controller.abort()
  }, [activityId, retry, onSessionExpired])

  const fields = activity ? getActivityFields(activity) : []

  return (
    <dialog
      ref={dialogRef}
      className="activity-dialog"
      data-type={activity?.type}
      aria-labelledby="activity-detail-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="activity-dialog-header">
        <p className="eyebrow">Detalle de actividad</p>
        <button className="secondary-button" type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <h2 id="activity-detail-title">{activity?.title ?? 'Tu actividad'}</h2>

      {loading ? (
        <p role="status">Cargando detalle…</p>
      ) : error ? (
        <>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setError(null)
              setLoading(true)
              setRetry((value) => value + 1)
            }}
          >
            Reintentar
          </button>
        </>
      ) : !activity ? (
        <p role="status">Esta actividad ya no está disponible.</p>
      ) : (
        <>
          <div className="activity-detail-summary">
            <span>{formatActivityType(activity.type)}</span>
            <span data-status={activity.status ?? undefined}>
              {formatStatus(activity.status)}
            </span>
          </div>
          <p className="activity-detail-schedule">
            {formatSchedule(activity.schedule)}
          </p>
          <p className="activity-detail-timezone">
            {activity.schedule.kind === 'date'
              ? 'Sin hora indicada.'
              : 'Horario de Madrid.'}
          </p>
          <dl className="activity-detail-fields">
            {fields.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <details className="activity-sync-details">
            <summary>Información de sincronización</summary>
            <dl className="activity-detail-fields">
              {activity.source_updated_at && (
                <div>
                  <dt>Último cambio en origen</dt>
                  <dd>
                    {timestampFormatter.format(
                      new Date(activity.source_updated_at),
                    )}
                  </dd>
                </div>
              )}
              <div>
                <dt>Última sincronización</dt>
                <dd>
                  {timestampFormatter.format(new Date(activity.last_synced_at))}
                </dd>
              </div>
            </dl>
          </details>
        </>
      )}
    </dialog>
  )
}
