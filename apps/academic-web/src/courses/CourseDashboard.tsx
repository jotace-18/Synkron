import { useRef, useState } from 'react'
import SubmitAssignmentDialog from '../assignments/SubmitAssignmentDialog'
import type { Assignment } from '../assignments/assignment.types'
import AssignmentsTable from '../assignments/AssignmentsTable'
import AssignmentForm from '../assignments/AssignmentForm'
import RetireAssignmentDialog from '../assignments/RetireAssignmentDialog'
import ExamForm from '../exams/ExamForm'
import RetireExamDialog from '../exams/RetireExamDialog'
import type { Exam } from '../exams/exam.types'
import ExamsTable from '../exams/ExamsTable'
import type { CourseGroup } from './course-groups'
import { summarizeCourse } from './course-summary'

const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

type CourseAction =
  | { kind: 'create-assignment' }
  | { kind: 'edit-assignment' | 'retire-assignment' | 'submit-assignment'; assignment: Assignment }
  | { kind: 'edit-exam' | 'retire-exam'; exam: Exam }

interface CourseDashboardProps {
  course: CourseGroup
  onSubmitted: (id: string) => void
  onRefresh: () => void
  onActivityChange: (open: boolean) => void
  onChanged: (message: string) => void
}

export default function CourseDashboard({ course, onSubmitted, onRefresh, onActivityChange, onChanged }: CourseDashboardProps) {
  const [action, setAction] = useState<CourseAction | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const pendingHeading = useRef<HTMLHeadingElement>(null)
  const newButton = useRef<HTMLButtonElement>(null)

  function beginAction(next: CourseAction, button: HTMLButtonElement) {
    opener.current = button
    setAction(next)
    onActivityChange(true)
  }

  function closeAction(checkList = false) {
    setAction(null)
    onActivityChange(false)
    if (checkList) onRefresh()
    else window.requestAnimationFrame(() => {
      const target = opener.current?.isConnected ? opener.current : pendingHeading.current
      target?.focus()
    })
  }

  function saved(message: string, changed = true) {
    closeAction()
    if (changed) onChanged(message)
  }

  const assignmentActions = {
    disabled: action !== null,
    retireLabel: 'Eliminar',
    onEdit: (assignment: Assignment, button: HTMLButtonElement) => beginAction({ kind: 'edit-assignment', assignment }, button),
    onRetire: (assignment: Assignment, button: HTMLButtonElement) => beginAction({ kind: 'retire-assignment', assignment }, button),
  }
  const examActions = {
    disabled: action !== null,
    retireLabel: 'Eliminar',
    onEdit: (exam: Exam, button: HTMLButtonElement) => beginAction({ kind: 'edit-exam', exam }, button),
    onRetire: (exam: Exam, button: HTMLButtonElement) => beginAction({ kind: 'retire-exam', exam }, button),
  }
  const creating = action?.kind === 'create-assignment'

  const summary = summarizeCourse(course)
  return (
    <article className="campus-course-dashboard" aria-labelledby="course-title">
      <header className="campus-heading">
        <div>
          <p className="campus-eyebrow">{course.abbreviation ?? 'Asignatura'}</p>
          <h1 id="course-title">{course.name}</h1>
          <p className="campus-description">Tu actividad, tus próximos compromisos y tus resultados en esta asignatura.</p>
        </div>
        <button
          ref={newButton}
          className="campus-button"
          type="button"
          disabled={action !== null}
          aria-expanded={creating}
          aria-controls={creating ? 'assignment-editor' : undefined}
          onClick={(event) => beginAction({ kind: 'create-assignment' }, event.currentTarget)}
        >
          Nueva entrega
        </button>
      </header>

      {(creating || action?.kind === 'edit-assignment') && <AssignmentForm
        key={action?.kind === 'edit-assignment' ? action.assignment.id : 'new'}
        assignment={action?.kind === 'edit-assignment' ? action.assignment : undefined}
        defaultCourse={{ course_name: course.name, course_abbreviation: course.abbreviation }}
        onCancel={closeAction}
        onSaved={(changed) => saved(creating ? 'Entrega creada.' : 'Entrega actualizada.', changed)}
      />}
      {action?.kind === 'edit-exam' && <ExamForm
        key={action.exam.id}
        exam={action.exam}
        onCancel={closeAction}
        onSaved={(changed) => saved('Examen actualizado.', changed)}
      />}

      <section className="campus-panel" aria-labelledby="course-overview-title">
        <h2 id="course-overview-title">Resumen general</h2>
        <dl className="campus-course-stats">
          <div><dt>Entregas pendientes</dt><dd>{summary.pending.length}</dd></div>
          <div><dt>Entregas realizadas</dt><dd>{summary.submitted.length}</dd></div>
          <div><dt>Exámenes programados</dt><dd>{summary.scheduled.length}</dd></div>
          <div><dt>Media de notas registradas</dt><dd>{summary.average === null ? 'Sin notas' : `${number.format(summary.average)} / 10`}</dd></div>
        </dl>
        <div className="campus-course-progress">
          <label htmlFor="course-progress">Entregas completadas: {summary.submitted.length} de {course.assignments.length} ({summary.progress} %)</label>
          <progress id="course-progress" value={summary.progress} max={100}>{summary.progress} %</progress>
        </div>
      </section>

      <section className="campus-panel" aria-labelledby="course-pending-title">
        <div className="campus-course-section-heading">
          <h2 id="course-pending-title" ref={pendingHeading} tabIndex={-1}>Entregas pendientes</h2>
          {summary.overdue > 0 && <span className="campus-badge campus-course-overdue">{summary.overdue} fuera de plazo</span>}
        </div>
        <p>Pendientes y en curso, ordenadas por vencimiento.</p>
        {summary.pending.length ? <AssignmentsTable
          assignments={summary.pending}
          {...assignmentActions}
          onSubmit={(assignment, button) => beginAction({ kind: 'submit-assignment', assignment }, button)}
        /> : (
          <p>{course.assignments.length ? '¡Todo al día! No tienes entregas pendientes.' : 'Todavía no hay entregas registradas.'}</p>
        )}
      </section>

      <section className="campus-panel" aria-labelledby="course-exams-title">
        <h2 id="course-exams-title">Próximos exámenes</h2>
        {summary.scheduled.length ? <ExamsTable exams={summary.scheduled} {...examActions} /> : (
          <p>No tienes exámenes programados para esta asignatura.</p>
        )}
      </section>

      <section className="campus-panel" aria-labelledby="course-grades-title">
        <h2 id="course-grades-title">Notas y evaluación</h2>
        <p>Las notas se muestran sobre 10. La media del resumen es aritmética y no representa la nota final de la asignatura.</p>
        {summary.grades.length ? (
          <div className="campus-table-wrap" role="region" aria-label="Notas de la asignatura" tabIndex={0}>
            <table className="campus-table">
              <caption>Resultados de entregas y exámenes</caption>
              <thead><tr>
                <th scope="col">Actividad</th><th scope="col">Tipo</th><th scope="col">Parte</th>
                <th scope="col">Nota</th><th scope="col">Ponderación</th>
              </tr></thead>
              <tbody>{summary.grades.map((grade) => (
                <tr key={grade.id}>
                  <td><strong>{grade.title}</strong></td><td>{grade.kind}</td><td>{grade.section}</td>
                  <td>{number.format(grade.grade)} / 10</td>
                  <td>{grade.weight === null ? 'Sin ponderación' : `${number.format(grade.weight)} % ${grade.basis === 'course' ? 'de la asignatura' : 'de la parte'}`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p>Todavía no hay notas registradas para esta asignatura.</p>}
      </section>

      <details className="campus-panel campus-course-history">
        <summary>Historial · Entregas realizadas y exámenes anteriores o cancelados</summary>
        <h2>Entregas realizadas</h2>
        {summary.submitted.length ? <AssignmentsTable assignments={summary.submitted} {...assignmentActions} /> : <p>No hay entregas realizadas.</p>}
        <h2>Exámenes realizados o cancelados</h2>
        {course.exams.some((exam) => exam.status !== 'scheduled') ? (
          <ExamsTable exams={course.exams.filter((exam) => exam.status !== 'scheduled')} {...examActions} />
        ) : <p>No hay exámenes realizados ni cancelados.</p>}
      </details>
      {action?.kind === 'submit-assignment' && <SubmitAssignmentDialog
        key={action.assignment.id}
        assignment={action.assignment}
        onSubmitted={() => {
          closeAction()
          onSubmitted(action.assignment.id)
        }}
        onCancel={closeAction}
      />}
      {action?.kind === 'retire-assignment' && <RetireAssignmentDialog
        key={action.assignment.id}
        assignment={action.assignment}
        actionLabel="Eliminar"
        onRetired={() => saved('Entrega eliminada.')}
        onCancel={closeAction}
      />}
      {action?.kind === 'retire-exam' && <RetireExamDialog
        key={action.exam.id}
        exam={action.exam}
        actionLabel="Eliminar"
        onRetired={() => saved('Examen eliminado.')}
        onCancel={closeAction}
      />}
    </article>
  )
}
