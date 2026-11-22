import type { AutomationSchedule } from './automation.types'

interface Props {
  schedules: AutomationSchedule[]
  pendingId: string | null
  onEdit: (schedule: AutomationSchedule) => void
  onToggle: (schedule: AutomationSchedule) => void
}

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
})

function formatTiming(schedule: AutomationSchedule): string {
  if (schedule.schedule_kind === 'daily') {
    return `Cada día a las ${schedule.daily_time}`
  }

  return schedule.interval_minutes === 60
    ? 'Cada hora'
    : `Cada ${schedule.interval_minutes} minutos`
}

export default function SchedulesTable({
  schedules,
  pendingId,
  onEdit,
  onToggle,
}: Props) {
  if (schedules.length === 0) {
    return (
      <p className="automation-description">
        Todavía no hay programaciones en esta página.
      </p>
    )
  }

  return (
    <div className="automation-table-scroll">
      <table
        className="automation-table"
        aria-label="Sincronizaciones programadas"
        aria-busy={pendingId !== null}
      >
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Frecuencia</th>
            <th scope="col">Estado</th>
            <th scope="col">Próxima ejecución</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>

        <tbody>
          {schedules.map((schedule) => (
            <tr key={schedule.id}>
              <th scope="row">{schedule.name}</th>
              <td>{formatTiming(schedule)}</td>
              <td>
                <span
                  className={`automation-badge ${
                    schedule.enabled
                      ? 'automation-badge--active'
                      : 'automation-badge--paused'
                  }`}
                >
                  {schedule.enabled ? 'Activa' : 'Pausada'}
                </span>
              </td>
              <td>
                {schedule.next_run_at
                  ? dateFormatter.format(new Date(schedule.next_run_at))
                  : '—'}
              </td>
              <td>
                <div className="automation-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={pendingId !== null}
                    aria-label={`Editar ${schedule.name}`}
                    onClick={() => onEdit(schedule)}
                  >
                    Editar
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={pendingId !== null}
                    aria-label={`${
                      schedule.enabled ? 'Pausar' : 'Activar'
                    } ${schedule.name}`}
                    onClick={() => onToggle(schedule)}
                  >
                    {pendingId === schedule.id
                      ? 'Guardando…'
                      : schedule.enabled ? 'Pausar' : 'Activar'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}