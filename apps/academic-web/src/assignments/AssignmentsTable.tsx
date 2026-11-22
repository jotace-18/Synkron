import type { Assignment } from './assignment.types'

interface AssignmentsTableProps {
  assignments: Assignment[]
  disabled?: boolean
  onEdit: (assignment: Assignment, opener: HTMLButtonElement) => void
  onRetire: (assignment: Assignment, opener: HTMLButtonElement) => void
}

const statuses = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  submitted: 'Entregada',
}

const sections = {
  theory: 'Teoría',
  practice: 'Prácticas',
  seminar: 'Seminarios',
}

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const instantFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
})

const gradeFormatter = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 2,
})

function formatDeadline(assignment: Assignment): string {
  if (assignment.due_date) {
    return dateFormatter.format(new Date(`${assignment.due_date}T00:00:00Z`))
  }

  return assignment.due_at
    ? instantFormatter.format(new Date(assignment.due_at))
    : 'Sin fecha'
}

export default function AssignmentsTable({
  assignments,
  disabled = false,
  onEdit,
  onRetire,
}: AssignmentsTableProps) {
  return (
    <div
      className="campus-table-wrap"
      role="region"
      aria-label="Tabla de entregas"
      tabIndex={0}
    >
      <table className="campus-table">
        <caption>Entregas académicas</caption>

        <thead>
          <tr>
            <th scope="col">Entrega</th>
            <th scope="col">Asignatura</th>
            <th scope="col">Parte</th>
            <th scope="col">Vencimiento</th>
            <th scope="col">Estado</th>
            <th scope="col">Nota</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>

        <tbody>
          {assignments.map((assignment) => (
            <tr key={assignment.id}>
              <td>
                <strong>{assignment.title}</strong>
                <span className="campus-cell-detail">
                  {assignment.mandatory ? 'Obligatoria' : 'Opcional'}
                </span>
              </td>

              <td>
                {assignment.course_name}
                {assignment.course_abbreviation && (
                  <> ({assignment.course_abbreviation})</>
                )}
              </td>

              <td>{sections[assignment.section]}</td>
              <td>{formatDeadline(assignment)}</td>

              <td>
                <span className="campus-badge" data-status={assignment.status}>
                  {statuses[assignment.status]}
                </span>
              </td>

              <td>
                {assignment.grade === null
                  ? 'Sin nota'
                  : `${gradeFormatter.format(assignment.grade)} / 10`}
              </td>
              <td>
                <div className="campus-row-actions">
                  <button
                    className="campus-row-action"
                    type="button"
                    disabled={disabled}
                    aria-label={`Editar ${assignment.title}`}
                    onClick={(event) => onEdit(assignment, event.currentTarget)}
                  >
                    Editar
                  </button>
                  <button
                    className="campus-row-action campus-row-action-danger"
                    type="button"
                    disabled={disabled}
                    aria-haspopup="dialog"
                    aria-label={`Retirar ${assignment.title}`}
                    onClick={(event) =>
                      onRetire(assignment, event.currentTarget)
                    }
                  >
                    Retirar
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
