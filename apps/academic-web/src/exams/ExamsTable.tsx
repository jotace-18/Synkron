import type { Exam } from './exam.types'

interface ExamsTableProps {
  exams: Exam[]
  disabled?: boolean
  onEdit: (exam: Exam, opener: HTMLButtonElement) => void
  onRetire: (exam: Exam, opener: HTMLButtonElement) => void
}

const statuses = {
  scheduled: 'Programado',
  completed: 'Realizado',
  cancelled: 'Cancelado',
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

function formatDeadline(exam: Exam): string {
  if (exam.exam_date) {
    return dateFormatter.format(new Date(`${exam.exam_date}T00:00:00Z`))
  }

  return exam.exam_at
    ? instantFormatter.format(new Date(exam.exam_at))
    : 'Sin fecha'
}

export default function ExamsTable({
  exams,
  disabled = false,
  onEdit,
  onRetire,
}: ExamsTableProps) {
  return (
    <div
      className="campus-table-wrap"
      role="region"
      aria-label="Tabla de exámenes"
      tabIndex={0}
    >
      <table className="campus-table">
        <caption>Exámenes académicas</caption>

        <thead>
          <tr>
            <th scope="col">Examen</th>
            <th scope="col">Asignatura</th>
            <th scope="col">Parte</th>
            <th scope="col">Celebración</th>
            <th scope="col">Estado</th>
            <th scope="col">Nota</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>

        <tbody>
          {exams.map((exam) => (
            <tr key={exam.id}>
              <td>
                <strong>{exam.title}</strong>
              </td>

              <td>
                {exam.course_name}
                {exam.course_abbreviation && <> ({exam.course_abbreviation})</>}
              </td>

              <td>{sections[exam.section]}</td>
              <td>{formatDeadline(exam)}</td>

              <td>
                <span className="campus-badge" data-status={exam.status}>
                  {statuses[exam.status]}
                </span>
              </td>

              <td>
                {exam.grade === null
                  ? 'Sin nota'
                  : `${gradeFormatter.format(exam.grade)} / 10`}
              </td>
              <td>
                <div className="campus-row-actions">
                  <button
                    className="campus-row-action"
                    type="button"
                    disabled={disabled}
                    aria-label={`Editar ${exam.title}`}
                    onClick={(event) => onEdit(exam, event.currentTarget)}
                  >
                    Editar
                  </button>
                  <button
                    className="campus-row-action campus-row-action-danger"
                    type="button"
                    disabled={disabled}
                    aria-haspopup="dialog"
                    aria-label={`Retirar ${exam.title}`}
                    onClick={(event) => onRetire(exam, event.currentTarget)}
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
