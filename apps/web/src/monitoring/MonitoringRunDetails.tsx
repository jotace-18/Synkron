import { useEffect, useRef, useState } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import {
  getMonitoringRun,
  MONITORING_PAGE_SIZE,
} from './monitoring-client'
import MonitoringRunDetailContent from './MonitoringRunDetailContent'
import type { MonitoringRunDetail } from './monitoring.types'

type Props = {
  runId: string
  onClose: () => void
  onSessionExpired: () => void
  onOpenActivity: (id: string) => void
}

type Result = {
  version: string
  detail: MonitoringRunDetail | null
  error: string | null
}

export default function MonitoringRunDetails({
  runId,
  onClose,
  onSessionExpired,
  onOpenActivity,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  const version = `${runId}/${offset}/${retry}`
  const current = result?.version === version ? result : null
  const loading = current === null
  const detail = current?.detail

  useEffect(() => {
    const dialog = dialogRef.current
    const returnFocus = document.activeElement instanceof HTMLElement
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

    getMonitoringRun(runId, offset, controller.signal)
      .then((item) => {
        if (controller.signal.aborted) return

        setResult({
          version,
          detail: item,
          error: null,
        })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return

        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }

        setResult({
          version,
          detail: null,
          error: 'No se pudo cargar el detalle. Inténtalo de nuevo.',
        })
      })

    return () => controller.abort()
  }, [runId, offset, version, onSessionExpired])

  return (
    <dialog
      ref={dialogRef}
      className="activity-dialog monitoring-dialog"
      aria-labelledby="monitoring-detail-title"
      aria-busy={loading}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="activity-dialog-header">
        <p className="eyebrow">Detalle de sincronización</p>
        <button
          className="secondary-button"
          type="button"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>

      <h2 id="monitoring-detail-title">Resultado de la ejecución</h2>

      {loading ? (
        <p role="status">Cargando detalle…</p>
      ) : current?.error ? (
        <p className="form-error" role="alert">{current.error}</p>
      ) : !detail ? (
        <p>Esta ejecución no está disponible en Monitoring.</p>
      ) : (
        <>
          <MonitoringRunDetailContent
            detail={detail}
            onOpenActivity={onOpenActivity}
          />

          <div className="monitoring-pagination">
            <button
              className="secondary-button"
              type="button"
              disabled={offset === 0}
              onClick={() =>
                setOffset(Math.max(0, offset - MONITORING_PAGE_SIZE))
              }
            >
              Anterior
            </button>

            <span>
              Página {Math.floor(offset / MONITORING_PAGE_SIZE) + 1}
            </span>

            <button
              className="secondary-button"
              type="button"
              disabled={detail.next_changes_offset === null}
              onClick={() => {
                const next = detail.next_changes_offset
                if (next !== null) setOffset(next)
              }}
            >
              Siguiente
            </button>
          </div>
        </>
      )}

      <button
        className="secondary-button"
        type="button"
        disabled={loading}
        onClick={() => setRetry((value) => value + 1)}
      >
        {current?.error ? 'Reintentar' : 'Actualizar detalle'}
      </button>
    </dialog>
  )
}