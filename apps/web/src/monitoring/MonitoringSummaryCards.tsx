import type { MonitoringSummary } from './monitoring.types'

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
})

type Props = {
  summary: MonitoringSummary
}

export default function MonitoringSummaryCards({ summary }: Props) {
  const totalChanges =
    summary.changes.created +
    summary.changes.updated +
    summary.changes.retired

  const lastRun = summary.last_run

  return (
    <section
      className="monitoring-stats"
      aria-label="Resumen de sincronizaciones"
    >
      <article className="monitoring-stat">
        <h2>Completadas</h2>
        <p className="monitoring-stat-value">
          {summary.completed_runs}
        </p>
        <p className="monitoring-stat-caption">Últimas 24 horas</p>
      </article>

      <article className="monitoring-stat monitoring-stat--failure">
        <h2>Fallidas</h2>
        <p className="monitoring-stat-value">
          {summary.failed_runs}
        </p>
        <p className="monitoring-stat-caption">Últimas 24 horas</p>
      </article>

      <article className="monitoring-stat">
        <h2>Cambios detectados</h2>
        <p className="monitoring-stat-value">{totalChanges}</p>
        <p className="monitoring-stat-caption">
          {summary.changes.created} altas ·{' '}
          {summary.changes.updated} actualizaciones ·{' '}
          {summary.changes.retired} retiradas
        </p>
        <p className="monitoring-stat-caption">Últimas 24 horas</p>
      </article>

      <article className="monitoring-stat monitoring-stat--last">
        <h2>Última sincronización</h2>
        <p className="monitoring-stat-result">
          {lastRun
            ? lastRun.status === 'completed'
              ? 'Completada'
              : 'Fallida'
            : 'Sin ejecuciones'}
        </p>
        <p className="monitoring-stat-caption">
          {lastRun ? (
            <time dateTime={lastRun.occurred_at}>
              {dateFormatter.format(new Date(lastRun.occurred_at))}
            </time>
          ) : (
            'Todavía no hemos recibido resultados.'
          )}
        </p>
      </article>
    </section>
  )
}
