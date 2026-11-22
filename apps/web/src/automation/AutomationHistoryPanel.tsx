import { useEffect, useState } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import { HISTORY_PAGE_SIZE, listAutomationHistory } from './automation-client'
import type {
  AutomationHistoryEntry,
  AutomationHistoryKind,
  AutomationHistoryStatus,
} from './automation.types'

interface Props {
  onSessionExpired: () => void
  onOpenRun: (id: string) => void
  onOpenActivity: (id: string) => void
}

const kindLabels = {
  schedule: 'Programación',
  rule: 'Regla',
  reminder: 'Recordatorio',
}
const statusLabels = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  failed: 'Fallida',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada',
}
const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
})

export default function AutomationHistoryPanel({
  onSessionExpired,
  onOpenRun,
  onOpenActivity,
}: Props) {
  const [kind, setKind] = useState<AutomationHistoryKind | 'all'>('all')
  const [status, setStatus] = useState<AutomationHistoryStatus | 'all'>('all')
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{
    version: string
    entries: AutomationHistoryEntry[]
    error: string | null
  } | null>(null)
  const version = `${kind}/${status}/${offset}/${retry}`
  const current = result?.version === version ? result : null

  useEffect(() => {
    const controller = new AbortController()
    listAutomationHistory(kind, status, offset, controller.signal)
      .then((entries) => {
        if (controller.signal.aborted) return
        if (entries.length === 0 && offset > 0) {
          setOffset((value) => Math.max(0, value - HISTORY_PAGE_SIZE))
          return
        }
        setResult({ version, entries, error: null })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof SessionExpiredError) return onSessionExpired()
        setResult({
          version,
          entries: [],
          error: 'No se pudo cargar el historial. Inténtalo de nuevo.',
        })
      })
    return () => controller.abort()
  }, [kind, status, offset, version, onSessionExpired])

  return (
    <section
      className="automation-card automation-history"
      aria-labelledby="automation-history-title"
      aria-busy={current === null}
    >
      <div className="automation-heading">
        <div>
          <h2 id="automation-history-title">Historial de automatizaciones</h2>
          <p className="automation-description">
            Una acción aceptada confirma la entrega de la solicitud. El
            resultado de la sincronización se consulta por separado. Horarios de
            Madrid.
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={!current}
          onClick={() => setRetry((value) => value + 1)}
        >
          Actualizar
        </button>
      </div>
      <div className="automation-history-filters">
        <label className="agenda-filter">
          <span>Origen</span>
          <select
            value={kind}
            onChange={(event) => {
              const value = event.currentTarget.value
              setKind(
                value === 'schedule' || value === 'rule' || value === 'reminder'
                  ? value
                  : 'all',
              )
              setOffset(0)
            }}
          >
            <option value="all">Todos</option>
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="agenda-filter">
          <span>Estado</span>
          <select
            value={status}
            onChange={(event) => {
              const value = event.currentTarget.value
              setStatus(
                value === 'pending' ||
                  value === 'accepted' ||
                  value === 'failed' ||
                  value === 'blocked' ||
                  value === 'cancelled'
                  ? value
                  : 'all',
              )
              setOffset(0)
            }}
          >
            <option value="all">Todos</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!current ? (
        <p role="status">Cargando historial…</p>
      ) : current.error ? (
        <p className="form-error" role="alert">
          {current.error}
        </p>
      ) : (
        <>
          {current.entries.length === 0 ? (
            <p>No hay acciones que coincidan con estos filtros.</p>
          ) : (
            <div className="automation-table-scroll">
              <table
                className="automation-table"
                aria-label="Historial de acciones"
              >
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Origen</th>
                    <th scope="col">Acción</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {current.entries.map((entry) => (
                    <tr key={`${entry.kind}:${entry.id}`}>
                      <td>
                        {dateFormatter.format(new Date(entry.created_at))}
                      </td>
                      <td>
                        <span className="automation-badge automation-badge--paused">
                          {kindLabels[entry.kind]}
                        </span>
                        <p className="automation-history-name">{entry.name}</p>
                      </td>
                      <td>
                        {entry.action_type === 'notify'
                          ? 'Enviar aviso'
                          : 'Solicitar sincronización'}
                      </td>
                      <td>
                        <span
                          className={`automation-badge automation-badge--${entry.status}`}
                        >
                          {statusLabels[entry.status]}
                        </span>
                      </td>
                      <td>
                        <div className="automation-actions">
                          {entry.sync_run_id && (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => onOpenRun(entry.sync_run_id!)}
                            >
                              Ver resultado
                            </button>
                          )}
                          {entry.activity_id && (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => onOpenActivity(entry.activity_id!)}
                            >
                              Ver actividad
                            </button>
                          )}
                        </div>
                        <details className="automation-history-details">
                          <summary>Seguimiento</summary>
                          <dl>
                            <div>
                              <dt>Intentos</dt>
                              <dd>{entry.attempt_count}</dd>
                            </div>
                            {entry.next_attempt_at && (
                              <div>
                                <dt>Próximo intento</dt>
                                <dd>
                                  {dateFormatter.format(
                                    new Date(entry.next_attempt_at),
                                  )}
                                </dd>
                              </div>
                            )}
                            {entry.resolved_at && (
                              <div>
                                <dt>Resolución</dt>
                                <dd>
                                  {dateFormatter.format(
                                    new Date(entry.resolved_at),
                                  )}
                                </dd>
                              </div>
                            )}
                            {entry.error_message && (
                              <div>
                                <dt>Motivo</dt>
                                <dd>{entry.error_message}</dd>
                              </div>
                            )}
                            {entry.error_code && (
                              <div>
                                <dt>Código</dt>
                                <dd>{entry.error_code}</dd>
                              </div>
                            )}
                            <div>
                              <dt>ID de acción</dt>
                              <dd>{entry.id}</dd>
                            </div>
                            {entry.result_id && (
                              <div>
                                <dt>ID de resultado</dt>
                                <dd>{entry.result_id}</dd>
                              </div>
                            )}
                          </dl>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="automation-pagination">
            <button
              className="secondary-button"
              type="button"
              disabled={offset === 0}
              onClick={() =>
                setOffset((value) => Math.max(0, value - HISTORY_PAGE_SIZE))
              }
            >
              Anterior
            </button>
            <span>Página {offset / HISTORY_PAGE_SIZE + 1}</span>
            <button
              className="secondary-button"
              type="button"
              disabled={current.entries.length < HISTORY_PAGE_SIZE}
              onClick={() => setOffset((value) => value + HISTORY_PAGE_SIZE)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </section>
  )
}
