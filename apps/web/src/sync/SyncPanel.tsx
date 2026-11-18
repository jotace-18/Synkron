import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import {
  getRun, listDefinitions, requestRun,
  type RunReference, type SyncDefinition, type SyncRun,
} from './sync-client'

interface SyncPanelProps {
  onSessionExpired: () => void
  onFinished: () => void
}

const statusLabels = {
  queued: 'En cola. Esperando turno…',
  running: 'Sincronizando actividades…',
  completed: 'Sincronización completada.',
  failed: 'No se pudo completar la sincronización.',
}

export default function SyncPanel({ onSessionExpired, onFinished }: SyncPanelProps) {
  const [definitions, setDefinitions] = useState<SyncDefinition[] | null>(null)
  const [definitionError, setDefinitionError] = useState<string | null>(null)
  const [definitionRetry, setDefinitionRetry] = useState(0)
  const [selected, setSelected] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requested, setRequested] = useState<RunReference | null>(null)
  const [run, setRun] = useState<SyncRun | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const [pollRetry, setPollRetry] = useState(0)
  const attempt = useRef<{ definitionId: string; key: string } | null>(null)
  const requestController = useRef<AbortController | null>(null)
  const enabled = (definitions ?? []).filter((definition) => definition.enabled)
  const definitionId = enabled.find(({ id }) => id === selected)?.id ?? enabled[0]?.id ?? ''
  const currentRun = run?.id === requested?.id ? run : null
  const terminal = currentRun?.status === 'completed' || currentRun?.status === 'failed'
  const busy = requesting || (requested !== null && !terminal)

  useEffect(() => {
    const controller = new AbortController()
    listDefinitions(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setDefinitions(items)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof SessionExpiredError) return onSessionExpired()
        setDefinitionError('No se pudieron cargar las sincronizaciones.')
      })
    return () => controller.abort()
  }, [definitionRetry, onSessionExpired])

  useEffect(() => () => requestController.current?.abort(), [])

  const requestedId = requested?.id
  useEffect(() => {
    if (!requestedId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      try {
        const result = await getRun(requestedId!, controller.signal)
        if (controller.signal.aborted) return
        setRun(result)
        if (result.status === 'completed' || result.status === 'failed') {
          onFinished()
        } else {
          timer = setTimeout(() => { void poll() }, 1500)
        }
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof SessionExpiredError) return onSessionExpired()
        setPollError('No se pudo consultar el estado. La sincronización puede seguir en curso.')
      }
    }

    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [requestedId, pollRetry, onSessionExpired, onFinished])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || requestController.current || !definitionId) return
    const controller = new AbortController()
    requestController.current = controller
    attempt.current ??= { definitionId, key: crypto.randomUUID() }
    const pending = attempt.current
    setRequesting(true)
    setRequestError(null)
    setPollError(null)
    setRequested(null)
    setRun(null)

    try {
      const result = await requestRun(pending.definitionId, pending.key, controller.signal)
      if (controller.signal.aborted) return
      attempt.current = null
      setRequested(result)
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof SessionExpiredError) return onSessionExpired()
      setRequestError(cause instanceof Error && !(cause instanceof TypeError) && !(cause instanceof DOMException) && !(cause instanceof SyntaxError)
        ? cause.message : 'No se pudo confirmar la solicitud. Reintenta para comprobarla sin duplicarla.')
    } finally {
      requestController.current = null
      if (!controller.signal.aborted) setRequesting(false)
    }
  }

  return (
    <section className="sync-panel" aria-label="Sincronizar actividades">
      {definitionError ? (
        <div className="sync-feedback">
          <p className="form-error" role="alert">{definitionError}</p>
          <button className="secondary-button" type="button" onClick={() => {
            setDefinitionError(null)
            setDefinitionRetry((value) => value + 1)
          }}>Reintentar</button>
        </div>
      ) : definitions === null ? (
        <p role="status">Cargando sincronizaciones…</p>
      ) : enabled.length === 0 ? (
        <p>No tienes ninguna sincronización habilitada todavía.</p>
      ) : (
        <>
          <form className="sync-controls" onSubmit={handleSubmit}>
            <label className="agenda-filter">
              <span>Qué sincronizar</span>
              <select value={definitionId} disabled={busy} onChange={(event) => {
                setSelected(event.target.value)
                attempt.current = null
                setRequested(null)
                setRun(null)
                setRequestError(null)
                setPollError(null)
              }}>
                {enabled.map((definition) => (
                  <option key={definition.id} value={definition.id}>{definition.name}</option>
                ))}
              </select>
            </label>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Sincronizando…' : requestError ? 'Reintentar solicitud' : 'Sincronizar ahora'}
            </button>
          </form>
          {requestError && <p className="form-error" role="alert">{requestError}</p>}
          {requested && (
            <div className="sync-result">
              <p role="status">{statusLabels[currentRun?.status ?? requested.status]}</p>
              {currentRun?.status === 'failed' && <p>{currentRun.error_message ?? 'Inténtalo de nuevo más tarde.'}</p>}
              {currentRun?.status === 'completed' && (
                <p className="sync-counts">
                  {currentRun.read_count} leídas · {currentRun.created_count} nuevas ·{' '}
                  {currentRun.updated_count} actualizadas · {currentRun.unchanged_count} sin cambios ·{' '}
                  {currentRun.retired_count} retiradas · {currentRun.ignored_count} ignoradas
                </p>
              )}
            </div>
          )}
          {pollError && (
            <div className="sync-feedback">
              <p className="form-error" role="alert">{pollError}</p>
              <button className="secondary-button" type="button" onClick={() => {
                setPollError(null)
                setPollRetry((value) => value + 1)
              }}>Volver a consultar</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
