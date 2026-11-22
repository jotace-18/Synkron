import { useCallback, useEffect, useRef, useState } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import {
  getUnreadCount,
  listNotifications,
  markNotificationRead,
  NOTIFICATIONS_PAGE_SIZE,
} from './notifications-client'
import type { NotificationFilter, UserNotification } from './notification.types'
import './notifications.css'

interface Props {
  onSessionExpired: () => void
  onOpenActivity: (id: string) => void
  onOpenRun: (id: string) => void
  refreshVersion: number
}

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
})

export default function NotificationInbox(props: Props) {
  const { onSessionExpired, refreshVersion } = props
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [countError, setCountError] = useState(false)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const controller = new AbortController()
    let inFlight = false
    async function update() {
      if (inFlight || controller.signal.aborted) return
      inFlight = true
      try {
        const unread = await getUnreadCount(controller.signal)
        if (controller.signal.aborted) return
        setCount(unread)
        setCountError(false)
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof SessionExpiredError) return onSessionExpired()
        setCountError(true)
      } finally {
        inFlight = false
      }
    }
    void update()
    const timer = setInterval(() => {
      if (!document.hidden) void update()
    }, 15_000)
    const onVisible = () => {
      if (!document.hidden) void update()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [revision, refreshVersion, onSessionExpired])

  return (
    <>
      <button
        className="secondary-button notifications-button"
        type="button"
        aria-haspopup="dialog"
        aria-label={
          countError
            ? 'Abrir avisos. Contador sin actualizar.'
            : `Abrir avisos${count === null ? '' : `, ${count} sin leer`}`
        }
        title={
          countError
            ? 'No se pudo actualizar el contador. Abre la bandeja para reintentar.'
            : 'Bandeja de avisos'
        }
        onClick={() => {
          refresh()
          setOpen(true)
        }}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Avisos{' '}
        <span className="notifications-count" aria-hidden="true">
          {countError ? '?' : count === null ? '…' : count > 99 ? '99+' : count}
        </span>
      </button>
      {open && (
        <NotificationDialog {...props} onClose={close} onChanged={refresh} />
      )}
    </>
  )
}

function NotificationDialog({
  onSessionExpired,
  onOpenActivity,
  onOpenRun,
  onClose,
  onChanged,
}: Props & { onClose: () => void; onChanged: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const alive = useRef(false)
  const [status, setStatus] = useState<NotificationFilter>('all')
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    version: string
    items: UserNotification[]
    error: string | null
  } | null>(null)
  const version = `${status}/${offset}/${retry}`
  const current = result?.version === version ? result : null
  const busy = pendingId !== null

  useEffect(() => {
    alive.current = true
    const dialog = dialogRef.current
    const focus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const overflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      alive.current = false
      dialog?.close()
      document.body.style.overflow = overflow
      if (focus?.isConnected) focus.focus()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    listNotifications(status, offset, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        if (items.length === 0 && offset > 0) {
          setOffset((value) => Math.max(0, value - NOTIFICATIONS_PAGE_SIZE))
          return
        }
        setResult({ version, items, error: null })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof SessionExpiredError) return onSessionExpired()
        setResult({
          version,
          items: [],
          error:
            'No se pudieron cargar los avisos. Puedes reintentar con Actualizar.',
        })
      })
    return () => controller.abort()
  }, [status, offset, version, onSessionExpired])

  async function markRead(id: string) {
    if (busy) return
    setPendingId(id)
    setActionError(null)
    try {
      await markNotificationRead(id)
      onChanged()
      if (alive.current) setRetry((value) => value + 1)
    } catch (cause) {
      if (!alive.current) return
      if (cause instanceof SessionExpiredError) return onSessionExpired()
      setActionError(
        'No se pudo confirmar la lectura. Actualiza la bandeja antes de reintentar.',
      )
    } finally {
      if (alive.current) setPendingId(null)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="notifications-dialog"
      aria-labelledby="notifications-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="notifications-heading">
        <div>
          <p className="eyebrow">Tu bandeja</p>
          <h2 id="notifications-title">Avisos</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div className="notifications-toolbar">
        <label className="agenda-filter">
          <span>Mostrar</span>
          <select
            value={status}
            disabled={busy}
            onChange={(event) => {
              const value = event.currentTarget.value
              setStatus(value === 'read' || value === 'unread' ? value : 'all')
              setOffset(0)
              setActionError(null)
            }}
          >
            <option value="all">Todos</option>
            <option value="unread">Sin leer</option>
            <option value="read">Leídos</option>
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={!current || busy}
          onClick={() => {
            setActionError(null)
            setRetry((value) => value + 1)
            onChanged()
          }}
        >
          Actualizar
        </button>
      </div>
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      <div aria-busy={!current || busy}>
        {!current ? (
          <p role="status">Cargando avisos…</p>
        ) : current.error ? (
          <p className="form-error" role="alert">
            {current.error}
          </p>
        ) : (
          <>
            {current.items.length === 0 ? (
              <p className="notifications-empty">
                No hay avisos que coincidan con este filtro.
              </p>
            ) : (
              <ul className="notifications-list">
                {current.items.map((item) => (
                  <li
                    key={item.id}
                    className={`notifications-item ${item.read_at === null ? 'notifications-item--unread' : ''}`}
                  >
                    <div className="notifications-meta">
                      <span>
                        {item.source.kind === 'reminder'
                          ? 'Recordatorio'
                          : 'Regla'}{' '}
                        · {item.read_at === null ? 'Sin leer' : 'Leído'}
                      </span>
                      <time dateTime={item.created_at}>
                        {dateFormatter.format(new Date(item.created_at))}
                      </time>
                    </div>
                    <p className="notifications-message">{item.message}</p>
                    <div className="automation-actions">
                      {item.read_at === null && (
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void markRead(item.id)
                          }}
                        >
                          {pendingId === item.id
                            ? 'Guardando…'
                            : 'Marcar como leído'}
                        </button>
                      )}
                      {item.source.activity_id && (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            onClose()
                            onOpenActivity(item.source.activity_id!)
                          }}
                        >
                          Ver actividad
                        </button>
                      )}
                      {item.source.kind === 'rule' && (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            if (item.source.kind === 'rule') {
                              onClose()
                              onOpenRun(item.source.sync_run_id)
                            }
                          }}
                        >
                          Ver sincronización
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="automation-pagination">
              <button
                className="secondary-button"
                type="button"
                disabled={busy || offset === 0}
                onClick={() =>
                  setOffset((value) =>
                    Math.max(0, value - NOTIFICATIONS_PAGE_SIZE),
                  )
                }
              >
                Anterior
              </button>
              <span>Página {offset / NOTIFICATIONS_PAGE_SIZE + 1}</span>
              <button
                className="secondary-button"
                type="button"
                disabled={
                  busy || current.items.length < NOTIFICATIONS_PAGE_SIZE
                }
                onClick={() =>
                  setOffset((value) => value + NOTIFICATIONS_PAGE_SIZE)
                }
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
