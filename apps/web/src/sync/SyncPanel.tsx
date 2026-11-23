import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import {
  getRun,
  listDefinitions,
  listSyncConnections,
  type SyncDefinition,
  type SyncRun,
} from './sync-client'
import { createBatch, submitBatch, type BatchEntry } from './sync-batch'
import ConnectSourceForm from './ConnectSourceForm'
import {
  assignSyncGroups,
  definitionsForGroup,
  batchGroups,
  groupResult,
  SYNC_GROUPS,
} from './sync-groups'

interface SyncPanelProps {
  onSessionExpired: () => void
  onFinished: () => void
}
const labels = {
  queued: 'En cola',
  running: 'Sincronizando…',
  completed: 'Completada',
  failed: 'Fallida',
}
const isTerminal = (run?: SyncRun) =>
  run?.status === 'completed' || run?.status === 'failed'

export default function SyncPanel({
  onSessionExpired,
  onFinished,
}: SyncPanelProps) {
  const [definitions, setDefinitions] = useState<SyncDefinition[] | null>(null)
  const [definitionError, setDefinitionError] = useState(false)
  const [definitionRetry, setDefinitionRetry] = useState(0)
  const [selected, setSelected] = useState('all')
  const [requesting, setRequesting] = useState(false)
  const [entries, setEntries] = useState<BatchEntry[]>([])
  const [runs, setRuns] = useState<Record<string, SyncRun>>({})
  const [pollErrors, setPollErrors] = useState<Record<string, string>>({})
  const [pollRetry, setPollRetry] = useState(0)
  const attempt = useRef<BatchEntry[]>([])
  const cache = useRef<Record<string, SyncRun>>({})
  const notified = useRef(new Set<string>())
  const requestController = useRef<AbortController | null>(null)
  const enabled = (definitions ?? []).filter((definition) => definition.enabled)
  const availableGroups = SYNC_GROUPS.filter(({ id }) =>
    enabled.some((definition) => definition.group === id),
  )
  const selection =
    selected === 'all' || availableGroups.some(({ id }) => id === selected)
      ? selected
      : 'all'
  const busy =
    requesting ||
    entries.some(({ receipt }) => receipt && !isTerminal(runs[receipt.id]))
  const unresolved = entries.some((entry) => !entry.receipt)
  const receiptIds = entries
    .flatMap(({ receipt }) => (receipt ? [receipt.id] : []))
    .join(',')

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listDefinitions(controller.signal),
      listSyncConnections(controller.signal),
    ])
      .then(([items, connections]) => {
        if (!controller.signal.aborted) {
          setDefinitions(assignSyncGroups(items, connections))
          setDefinitionError(false)
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof SessionExpiredError) return onSessionExpired()
        setDefinitionError(true)
      })
    return () => controller.abort()
  }, [definitionRetry, onSessionExpired])
  useEffect(() => () => requestController.current?.abort(), [])

  useEffect(() => {
    if (!receiptIds) return
    const controller = new AbortController()
    const timers = new Set<ReturnType<typeof setTimeout>>()
    async function poll(id: string) {
      if (isTerminal(cache.current[id])) return
      try {
        const result = await getRun(id, controller.signal)
        if (controller.signal.aborted) return
        cache.current[id] = result
        setRuns((previous) => ({ ...previous, [id]: result }))
        setPollErrors((previous) => {
          const next = { ...previous }
          delete next[id]
          return next
        })
        if (isTerminal(result)) {
          if (!notified.current.has(id)) {
            notified.current.add(id)
            onFinished()
          }
        } else {
          const timer = setTimeout(() => {
            timers.delete(timer)
            void poll(id)
          }, 1500)
          timers.add(timer)
        }
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof SessionExpiredError) {
          controller.abort()
          return onSessionExpired()
        }
        setPollErrors((previous) => ({
          ...previous,
          [id]: 'No se pudo consultar el estado. Puede seguir en curso.',
        }))
      }
    }
    for (const id of receiptIds.split(',')) void poll(id)
    return () => {
      controller.abort()
      for (const timer of timers) clearTimeout(timer)
    }
  }, [receiptIds, pollRetry, onSessionExpired, onFinished])

  async function start(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || requestController.current) return
    if (!unresolved) {
      attempt.current = createBatch(definitionsForGroup(enabled, selection))
      cache.current = {}
      notified.current.clear()
      setRuns({})
      setPollErrors({})
    }
    if (!attempt.current.length) return
    const controller = new AbortController()
    requestController.current = controller
    setRequesting(true)
    setEntries(attempt.current.map((entry) => ({ ...entry })))
    try {
      await submitBatch(attempt.current, controller.signal, () => {
        if (!controller.signal.aborted)
          setEntries(attempt.current.map((entry) => ({ ...entry })))
      })
    } catch (cause) {
      if (!controller.signal.aborted && cause instanceof SessionExpiredError)
        onSessionExpired()
    } finally {
      requestController.current = null
      if (!controller.signal.aborted) setRequesting(false)
    }
  }
  const completed =
    entries.length > 0 &&
    entries.every(({ receipt }) => receipt && isTerminal(runs[receipt.id]))
  const failed = entries.some(
    ({ receipt, error }) =>
      error || (receipt && runs[receipt.id]?.status === 'failed'),
  )
  return (
    <section className="sync-panel" aria-label="Sincronizar actividades">
      {definitionError ? (
        <div className="sync-feedback">
          <p className="form-error" role="alert">
            No se pudieron cargar las sincronizaciones.
          </p>
          <button
            className="secondary-button"
            onClick={() => setDefinitionRetry((n) => n + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : definitions === null ? (
        <p role="status">Cargando sincronizaciones…</p>
      ) : enabled.length === 0 ? (
        <p>
          No tienes ninguna sincronización habilitada todavía. Conecta una
          fuente para empezar.
        </p>
      ) : (
        <form className="sync-controls" onSubmit={start}>
          <label className="agenda-filter">
            <span>Qué sincronizar</span>
            <select
              value={selection}
              disabled={busy}
              onChange={(e) => {
                setSelected(e.target.value)
                attempt.current = []
                setEntries([])
                setRuns({})
                setPollErrors({})
              }}
            >
              <option value="all">Todos los bloques</option>
              {availableGroups.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" disabled={busy || !enabled.length}>
            {busy
              ? 'Sincronizando…'
              : unresolved
                ? 'Reintentar pendientes'
                : selection === 'all'
                  ? 'Sincronizar todo'
                  : `Sincronizar ${availableGroups.find(({ id }) => id === selection)?.label ?? 'bloque'}`}
          </button>
        </form>
      )}
      {entries.length > 0 && (
        <div className="sync-result" aria-live="polite">
          <p>
            {completed
              ? failed
                ? 'Sincronización terminada con incidencias.'
                : 'Sincronización completada.'
              : 'Seguimiento de las fuentes seleccionadas'}
          </p>
          <ul className="sync-source-results">
            {batchGroups(entries).map((group) => {
              const summary = groupResult(group.entries, runs)
              return (
                <li key={group.id}>
                  <strong>{group.label}</strong>
                  <span>{summary.status}</span>
                  {summary.terminalCount > 0 && (
                    <p className="sync-counts">
                      {summary.counts.read_count} leídas ·{' '}
                      {summary.counts.created_count} nuevas ·{' '}
                      {summary.counts.updated_count} actualizadas ·{' '}
                      {summary.counts.unchanged_count} sin cambios ·{' '}
                      {summary.counts.retired_count} retiradas ·{' '}
                      {summary.counts.ignored_count} ignoradas
                      {summary.terminalCount < group.entries.length
                        ? ' · Resultados parciales'
                        : ''}
                    </p>
                  )}
                  <details className="sync-execution-details">
                    <summary>Ver detalle de las ejecuciones</summary>
                    <ul>
                      {group.entries.map(({ definition, receipt, error }) => {
                        const run = receipt ? runs[receipt.id] : undefined
                        return (
                          <li key={definition.id}>
                            <strong>{definition.name}</strong>
                            <span>
                              {receipt
                                ? labels[run?.status ?? receipt.status]
                                : error
                                  ? 'Solicitud sin confirmar'
                                  : 'Preparando solicitud…'}
                            </span>
                            {error && <p className="form-error">{error}</p>}
                            {run?.status === 'failed' && (
                              <p className="form-error">
                                {run.error_message ??
                                  'No se pudo completar esta fuente.'}
                              </p>
                            )}
                            {run?.status === 'completed' && (
                              <p className="sync-counts">
                                {run.read_count} leídas · {run.created_count}{' '}
                                nuevas · {run.updated_count} actualizadas ·{' '}
                                {run.unchanged_count} sin cambios ·{' '}
                                {run.retired_count} retiradas ·{' '}
                                {run.ignored_count} ignoradas
                              </p>
                            )}
                            {receipt && pollErrors[receipt.id] && (
                              <p className="form-error">
                                {pollErrors[receipt.id]}
                              </p>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </details>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {Object.keys(pollErrors).length > 0 && (
        <button
          className="secondary-button"
          onClick={() => setPollRetry((n) => n + 1)}
        >
          Volver a consultar
        </button>
      )}
      <ConnectSourceForm
        onSessionExpired={onSessionExpired}
        onConnected={() => setDefinitionRetry((n) => n + 1)}
      />
    </section>
  )
}
