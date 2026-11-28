import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import {
  createAssignment,
  updateAssignment,
  AssignmentUnavailableError,
  UnconfirmedAssignmentError,
} from './assignments-client'
import {
  readAssignmentForm,
  assignmentPatch,
  assignmentDeadlineFields,
  assignmentCourseCode,
  CURRENT_COURSE,
  type AssignmentCourse,
} from './assignment-form'
import type { Assignment, AssignmentInput } from './assignment.types'
import { COURSES } from './courses'

interface AssignmentFormProps {
  assignment?: Assignment
  defaultCourse?: AssignmentCourse
  onSaved: (changed: boolean) => void
  onCancel: (checkList: boolean) => void
}

export default function AssignmentForm({
  assignment,
  defaultCourse,
  onSaved,
  onCancel,
}: AssignmentFormProps) {
  const currentCourse = assignment ?? defaultCourse
  const [workMode, setWorkMode] = useState<AssignmentInput['work_mode']>(
    assignment?.work_mode ?? 'individual',
  )
  const [members, setMembers] = useState(
    assignment?.group_members.join('\n') ?? '',
  )
  const [courseCode, setCourseCode] = useState(() =>
    assignmentCourseCode(currentCourse),
  )
  const legacyCourse = assignmentCourseCode(currentCourse) === CURRENT_COURSE
  const deadline = assignmentDeadlineFields(assignment)
  const selectedCourse = COURSES.find(
    ({ abbreviation }) => abbreviation === courseCode,
  )
  const [pending, setPending] = useState(false)
  const [checkRequired, setCheckRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => () => request.current?.abort(), [])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || checkRequired || request.current) return
    let input: AssignmentInput
    try {
      input = readAssignmentForm(new FormData(event.currentTarget), assignment, defaultCourse)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Revisa los datos de la entrega.',
      )
      window.requestAnimationFrame(() => errorRef.current?.focus())
      return
    }

    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    try {
      const patch = assignment ? assignmentPatch(input, assignment) : null
      if (assignment && patch) {
        await updateAssignment(assignment.id, patch, controller.signal)
      } else {
        await createAssignment(input, controller.signal)
      }
      if (!controller.signal.aborted)
        onSaved(patch === null || Object.keys(patch).length > 0)
    } catch (cause) {
      if (controller.signal.aborted) return
      setCheckRequired(
        cause instanceof UnconfirmedAssignmentError ||
          cause instanceof AssignmentUnavailableError,
      )
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo guardar la entrega.',
      )
      window.requestAnimationFrame(() => errorRef.current?.focus())
    } finally {
      request.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  return (
    <section
      className="campus-panel campus-create-panel"
      aria-labelledby="assignment-editor-title"
      id="assignment-editor"
    >
      <h2 id="assignment-editor-title">
        {assignment ? 'Editar entrega' : 'Nueva entrega'}
      </h2>
      <p>
        {assignment
          ? 'Actualiza los datos y guarda los cambios.'
          : 'Indica los datos de la entrega. Puedes añadir la nota más adelante.'}
      </p>
      <form
        className="campus-form"
        onSubmit={handleSubmit}
        aria-busy={pending}
        onInvalidCapture={(event) => {
          if (event.target instanceof HTMLElement) {
            const details = event.target.closest('details')
            if (details) details.open = true
          }
        }}
      >
        <fieldset
          className="campus-form-grid campus-fieldset"
          disabled={pending}
          aria-label="Datos de la entrega"
        >
          <label className="campus-field campus-field-wide">
            <span>Título</span>
            <input
              name="title"
              defaultValue={assignment?.title ?? ''}
              maxLength={200}
              required
              autoFocus
            />
          </label>
          <label className="campus-field campus-field-wide">
            <span>Asignatura (sigla)</span>
            <select
              name="course_abbreviation"
              value={courseCode}
              required
              aria-describedby="selected-course-name"
              onChange={(event) => setCourseCode(event.target.value)}
            >
              <option value="" disabled>
                Selecciona una asignatura
              </option>
              {legacyCourse && currentCourse && (
                <option value={CURRENT_COURSE}>
                  {currentCourse.course_abbreviation ?? currentCourse.course_name}
                </option>
              )}
              {COURSES.map(({ abbreviation }) => (
                <option key={abbreviation} value={abbreviation}>
                  {abbreviation}
                </option>
              ))}
            </select>
            <span id="selected-course-name" className="campus-course-name">
              {(courseCode === CURRENT_COURSE
                ? currentCourse?.course_name
                : selectedCourse?.name) ??
                'Elige una sigla para ver la asignatura.'}
            </span>
          </label>
          <label className="campus-field">
            <span>Parte</span>
            <select
              name="section"
              defaultValue={assignment?.section ?? 'practice'}
            >
              <option value="theory">Teoría</option>
              <option value="practice">Prácticas</option>
              <option value="seminar">Seminarios</option>
            </select>
          </label>
          <label className="campus-field">
            <span>Estado</span>
            <select
              name="status"
              defaultValue={assignment?.status ?? 'pending'}
            >
              <option value="pending">Pendiente</option>
              <option value="in_progress">En curso</option>
              <option value="submitted">Entregada</option>
            </select>
          </label>
          <label className="campus-field">
            <span>Fecha de vencimiento</span>
            <input
              name="date"
              type="date"
              defaultValue={deadline.date}
              min="0001-01-01"
              max="9999-12-31"
              required
            />
          </label>
          <label className="campus-field">
            <span>Hora (opcional, horario de Madrid)</span>
            <input
              name="time"
              type="time"
              step={60}
              defaultValue={deadline.time}
            />
          </label>
          <label className="campus-checkbox campus-field-wide">
            <input
              name="mandatory"
              type="checkbox"
              defaultChecked={assignment?.mandatory ?? true}
            />
            <span>Entrega obligatoria</span>
          </label>

          <details className="campus-form-details campus-field-wide">
            <summary>Más detalles</summary>
            <div className="campus-form-grid">
              <label className="campus-field">
                <span>Modalidad</span>
                <select
                  name="work_mode"
                  value={workMode}
                  onChange={(event) =>
                    setWorkMode(
                      event.target.value as AssignmentInput['work_mode'],
                    )
                  }
                >
                  <option value="individual">Individual</option>
                  <option value="group">En grupo</option>
                </select>
              </label>
              <label className="campus-field">
                <span>Nota (opcional, sobre 10)</span>
                <input
                  name="grade"
                  type="number"
                  min={0}
                  max={10}
                  step="0.01"
                  defaultValue={assignment?.grade ?? ''}
                />
              </label>
              {workMode === 'group' && (
                <label className="campus-field campus-field-wide">
                  <span>Integrantes (opcional, un nombre por línea)</span>
                  <textarea
                    name="group_members"
                    rows={3}
                    value={members}
                    onChange={(event) => setMembers(event.target.value)}
                  />
                </label>
              )}
              <label className="campus-field">
                <span>Ponderación (%, opcional)</span>
                <input
                  name="weight_percent"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  defaultValue={assignment?.weight_percent ?? ''}
                />
              </label>
              <label className="campus-field">
                <span>Referencia de la ponderación</span>
                <select
                  name="weight_basis"
                  defaultValue={assignment?.weight_basis ?? 'course'}
                >
                  <option value="course">Total de la asignatura</option>
                  <option value="section">
                    Solo esta parte (teoría, prácticas o seminarios)
                  </option>
                </select>
              </label>
            </div>
          </details>
        </fieldset>

        {error && (
          <p ref={errorRef} className="campus-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        )}
        <div className="campus-form-actions">
          <button
            className="campus-button"
            type="submit"
            disabled={pending || checkRequired}
          >
            {pending
              ? 'Guardando…'
              : assignment
                ? 'Guardar cambios'
                : 'Guardar entrega'}
          </button>
          <button
            className="campus-button campus-button-secondary"
            type="button"
            disabled={pending}
            onClick={() => onCancel(checkRequired)}
          >
            {checkRequired ? 'Comprobar entregas' : 'Cancelar'}
          </button>
        </div>
      </form>
    </section>
  )
}
