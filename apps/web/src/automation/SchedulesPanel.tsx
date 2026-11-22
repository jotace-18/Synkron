
import { useEffect, useState } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import {
  listDefinitions,
  type SyncDefinition,
} from '../sync/sync-client'
import {
  listSchedules,
  saveSchedule,
  SCHEDULE_PAGE_SIZE,
} from './automation-client'
import type { AutomationSchedule } from './automation.types'
import ScheduleForm from './ScheduleForm'
import SchedulesTable from './SchedulesTable'

interface Props {
  onSessionExpired: () => void
}

interface ListResult {
  version: string
  schedules: AutomationSchedule[]
  error: string | null
}

export default function SchedulesPanel({ onSessionExpired }: Props) {
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<ListResult | null>(null)
  const [definitions, setDefinitions] =
    useState<SyncDefinition[] | null>(null)
  const [definitionError, setDefinitionError] =
    useState<string | null>(null)
  const [definitionRetry, setDefinitionRetry] = useState(0)
  const [editing, setEditing] =
    useState<AutomationSchedule | 'new' | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const version = `${offset}/${retry}`
  const current = result?.version === version ? result : null
  const loading = current === null
  const busy = pendingId !== null

  useEffect(() => {
    const controller = new AbortController()

    listSchedules(offset, controller.signal)
      .then((schedules) => {
        if (controller.signal.aborted) return
        setResult({ version, schedules, error: null })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return

        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }

        setResult({
          version,
          schedules: [],
          error: 'No se pudieron cargar las programaciones.',
        })
      })

    return () => controller.abort()
  }, [offset, version, onSessionExpired])

  useEffect(() => {
    const controller = new AbortController()

    listDefinitions(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setDefinitions(items)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return

        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }

        setDefinitionError(
          'No se pudieron cargar las sincronizaciones disponibles.',
        )
      })

    return () => controller.abort()
  }, [definitionRetry, onSessionExpired])

  function refreshDefinitions() {
    setDefinitions(null)
    setDefinitionError(null)
    setDefinitionRetry((value) => value + 1)
  }

  function openEditor(schedule: AutomationSchedule | 'new') {
    setActionError(null)
    setNotice(null)
    setEditing(schedule)
  }

  function handleSaved() {
    setEditing(null)
    setOffset(0)
    setRetry((value) => value + 1)
    setNotice('Programación guardada.')
  }

  async function handleToggle(schedule: AutomationSchedule) {
    if (busy || loading || editing !== null) return

    setPendingId(schedule.id)
    setActionError(null)
    setNotice(null)

    try {
      await saveSchedule(
        { ...schedule, enabled: !schedule.enabled },
        schedule.id,
      )

      setNotice(
        schedule.enabled
          ? 'Programación pausada.'
          : 'Programación activada.',
      )
      setRetry((value) => value + 1)
    } catch (cause: unknown) {
      if (cause instanceof SessionExpiredError) {
        onSessionExpired()
        return
      }

      setActionError(
        cause instanceof Error &&
        !(cause instanceof TypeError) &&
        !(cause instanceof SyntaxError) &&
        !(cause instanceof DOMException)
          ? cause.message
          : 'No se pudo confirmar el cambio. Actualiza el listado.',
      )
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section
      className="automation-card"
      aria-labelledby="schedules-title"
    >
      <div className="automation-heading">
        <div>
          <h2 id="schedules-title">Sincronizaciones programadas</h2>
          <p className="automation-description">
            Elige cuándo actualizar tus actividades automáticamente.
            Horarios de Madrid.
          </p>
        </div>

        <div className="automation-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={loading || busy || editing !== null}
            onClick={() => {
              setActionError(null)
              setNotice(null)
              setRetry((value) => value + 1)
              refreshDefinitions()
            }}
          >
            Actualizar
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={loading || busy || editing !== null}
            onClick={() => openEditor('new')}
          >
            Nueva programación
          </button>
        </div>
      </div>

      {notice && (
        <p className="automation-notice" role="status">{notice}</p>
      )}

      {actionError && (
        <p className="form-error" role="alert">{actionError}</p>
      )}

      {editing !== null && (
        definitionError ? (
          <div className="automation-form">
            <p className="form-error" role="alert">
              {definitionError}
            </p>
            <div className="automation-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={refreshDefinitions}
              >
                Reintentar
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setEditing(null)}
              >
                Volver al listado
              </button>
            </div>
          </div>
        ) : definitions === null ? (
          <div className="automation-form">
            <p role="status">Cargando sincronizaciones…</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setEditing(null)}
            >
              Volver al listado
            </button>
          </div>
        ) : (
          <ScheduleForm
            key={editing === 'new' ? 'new' : editing.id}
            definitions={definitions}
            initial={editing === 'new' ? undefined : editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
            onSessionExpired={onSessionExpired}
          />
        )
      )}

      {editing === null && (
        loading ? (
          <p role="status">Cargando programaciones…</p>
        ) : current.error ? (
          <p className="form-error" role="alert">{current.error}</p>
        ) : (
          <>
            <SchedulesTable
              schedules={current.schedules}
              pendingId={pendingId}
              onEdit={openEditor}
              onToggle={handleToggle}
            />

            <div className="automation-pagination">
              <button
                className="secondary-button"
                type="button"
                disabled={busy || offset === 0}
                onClick={() => setOffset(
                  (value) => Math.max(0, value - SCHEDULE_PAGE_SIZE),
                )}
              >
                Anterior
              </button>
              <span>Página {offset / SCHEDULE_PAGE_SIZE + 1}</span>
              <button
                className="secondary-button"
                type="button"
                disabled={
                  busy ||
                  current.schedules.length < SCHEDULE_PAGE_SIZE
                }
                onClick={() => setOffset(
                  (value) => value + SCHEDULE_PAGE_SIZE,
                )}
              >
                Siguiente
              </button>
            </div>
          </>
        )
      )}
    </section>
  )
}
