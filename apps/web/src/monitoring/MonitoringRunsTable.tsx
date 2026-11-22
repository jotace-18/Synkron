import { MONITORING_PAGE_SIZE } from './monitoring-client'
import type {
  MonitoringRun,
  MonitoringRunStatus,
} from './monitoring.types'

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
})

type Props = {
  runs: MonitoringRun[]
  status: MonitoringRunStatus | 'all'
  offset: number
  loading: boolean
  onStatusChange: (status: MonitoringRunStatus | 'all') => void
  onOffsetChange: (offset: number) => void
  onSelect: (id: string) => void
}

export default function MonitoringRunsTable({
  runs,
  status,
  offset,
  loading,
  onStatusChange,
  onOffsetChange,
  onSelect,
}: Props) {
  return (
    <section
      className="monitoring-history"
      aria-labelledby="monitoring-history-title"
      aria-busy={loading}
    >
      <div className="monitoring-history-heading">
        <h2 id="monitoring-history-title">Historial de sincronizaciones</h2>

        <label>
          Resultado
          <select
            value={status}
            disabled={loading}
            onChange={(event) =>
              onStatusChange(
                event.target.value as MonitoringRunStatus | 'all',
              )
            }
          >
            <option value="all">Todos</option>
            <option value="completed">Completadas</option>
            <option value="failed">Fallidas</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p role="status">Cargando historial…</p>
      ) : runs.length === 0 ? (
        <p>No hay ejecuciones para esta consulta.</p>
      ) : (
        <div
          className="monitoring-table-scroll"
          role="region"
          aria-label="Historial de sincronizaciones"
          tabIndex={0}
        >
          <table className="monitoring-table">
            <thead>
              <tr>
                <th scope="col">Fecha del resultado</th>
                <th scope="col">Ejecución</th>
                <th scope="col">Resultado</th>
                <th scope="col">Leídas</th>
                <th scope="col">Cambios</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <time dateTime={run.occurred_at}>
                      {dateFormatter.format(new Date(run.occurred_at))}
                    </time>
                  </td>
                  <td title={run.id}>{run.id.slice(0, 8)}</td>
                  <td>
                    <span className={`monitoring-badge monitoring-badge--${run.status}`}>
                      {run.status === 'completed' ? 'Completada' : 'Fallida'}
                    </span>
                  </td>
                  <td>{run.counts.read}</td>
                  <td>
                    {run.counts.created +
                      run.counts.updated +
                      run.counts.retired}
                  </td>
                  <td>
                    <button
                      className="secondary-button"
                      type="button"
                      aria-label={`Ver detalle de la ejecución ${run.id.slice(0, 8)}`}
                      onClick={() => onSelect(run.id)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="monitoring-pagination">
        <button
          className="secondary-button"
          type="button"
          disabled={loading || offset === 0}
          onClick={() =>
            onOffsetChange(Math.max(0, offset - MONITORING_PAGE_SIZE))
          }
        >
          Anterior
        </button>

        <span>Página {Math.floor(offset / MONITORING_PAGE_SIZE) + 1}</span>

        <button
          className="secondary-button"
          type="button"
          disabled={loading || runs.length < MONITORING_PAGE_SIZE}
          onClick={() => onOffsetChange(offset + MONITORING_PAGE_SIZE)}
        >
          Siguiente
        </button>
      </div>
    </section>
  )
}