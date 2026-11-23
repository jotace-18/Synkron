import { formatActivityType } from '../activities/activity-format'
import type { MonitoringRunDetail } from './monitoring.types'

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
})

const changeLabels = {
  created: 'Alta',
  updated: 'Actualización',
  retired: 'Retirada',
}

const fieldLabels: Record<string, string> = {
  title: 'Título',
  status: 'Estado',
  grade: 'Nota',
  schedule: 'Fecha, hora o duración',
  people: 'Personas',
  deleted_at: 'Retirada',
  course_name: 'Asignatura',
  course_abbreviation: 'Sigla',
  section: 'Parte',
  mandatory: 'Obligatoriedad',
  work_mode: 'Modalidad',
  group_members: 'Integrantes',
  training_mode: 'Modalidad de entrenamiento',
  accompanied: 'Compañía',
  weight_percent: 'Ponderación',
  weight_basis: 'Referencia de ponderación',
}

type Props = {
  detail: MonitoringRunDetail
  onOpenActivity: (id: string) => void
}

export default function MonitoringRunDetailContent({
  detail,
  onOpenActivity,
}: Props) {
  const { run, changes } = detail

  const counts = [
    ['Leídas', run.counts.read],
    ['Creadas', run.counts.created],
    ['Actualizadas', run.counts.updated],
    ['Sin cambios', run.counts.unchanged],
    ['Retiradas', run.counts.retired],
    ['Ignoradas', run.counts.ignored],
  ] as const

  return (
    <>
      <span className={`monitoring-badge monitoring-badge--${run.status}`}>
        {run.status === 'completed' ? 'Completada' : 'Fallida'}
      </span>

      <p>
        Resultado del{' '}
        <time dateTime={run.occurred_at}>
          {dateFormatter.format(new Date(run.occurred_at))}
        </time>
      </p>

      {run.error && (
        <div className="monitoring-run-error">
          <strong>La sincronización terminó con un error</strong>
          <p>{run.error.message}</p>
          <p>Código: {run.error.code}</p>
        </div>
      )}

      <dl className="monitoring-counts">
        {counts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h3>Cambios relacionados</h3>

      {changes.length === 0 ? (
        <p>No hay cambios registrados en esta página.</p>
      ) : (
        <ul className="monitoring-changes">
          {changes.map((change) => (
            <li key={change.event_id}>
              <strong>
                {changeLabels[change.change_type]} ·{' '}
                {formatActivityType(change.activity_type)}
              </strong>
              {change.changed_fields.length > 0 && (
                <p>
                  Campos:{' '}
                  {change.changed_fields
                    .map((field) =>
                      field === 'title' &&
                      change.activity_type === 'personal.event'
                        ? 'Asunto'
                        : (fieldLabels[field] ?? field),
                    )
                    .join(', ')}
                </p>
              )}
              <button
                className="secondary-button"
                type="button"
                onClick={() => onOpenActivity(change.activity_id)}
              >
                Ver actividad
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="monitoring-trace">
        <summary>Información de seguimiento</summary>
        <dl>
          <dt>Ejecución</dt>
          <dd>{run.id}</dd>
          <dt>Definición</dt>
          <dd>{run.definition_id}</dd>
          <dt>Recibido en Monitoring</dt>
          <dd>{dateFormatter.format(new Date(run.received_at))}</dd>
        </dl>
      </details>
    </>
  )
}
