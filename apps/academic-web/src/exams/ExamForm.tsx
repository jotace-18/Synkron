import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import {
  createExam,
  updateExam,
  ExamUnavailableError,
  UnconfirmedExamError,
} from './exams-client'
import {
  readExamForm,
  examPatch,
  examDeadlineFields,
  examCourseCode,
  CURRENT_COURSE,
} from './exam-form'
import type { Exam, ExamInput } from './exam.types'
import { COURSES } from '../assignments/courses'

interface ExamFormProps {
  exam?: Exam
  onSaved: (changed: boolean) => void
  onCancel: (checkList: boolean) => void
}

export default function ExamForm({ exam, onSaved, onCancel }: ExamFormProps) {
  const [courseCode, setCourseCode] = useState(() => examCourseCode(exam))
  const legacyCourse = examCourseCode(exam) === CURRENT_COURSE
  const deadline = examDeadlineFields(exam)
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
    let input: ExamInput
    try {
      input = readExamForm(new FormData(event.currentTarget), exam)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Revisa los datos del examen.',
      )
      window.requestAnimationFrame(() => errorRef.current?.focus())
      return
    }

    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    try {
      const patch = exam ? examPatch(input, exam) : null
      if (exam && patch) {
        await updateExam(exam.id, patch, controller.signal)
      } else {
        await createExam(input, controller.signal)
      }
      if (!controller.signal.aborted)
        onSaved(patch === null || Object.keys(patch).length > 0)
    } catch (cause) {
      if (controller.signal.aborted) return
      setCheckRequired(
        cause instanceof UnconfirmedExamError ||
          cause instanceof ExamUnavailableError,
      )
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo guardar el examen.',
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
      aria-labelledby="exam-editor-title"
      id="exam-editor"
    >
      <h2 id="exam-editor-title">{exam ? 'Editar examen' : 'Nuevo examen'}</h2>
      <p>
        {exam
          ? 'Actualiza los datos y guarda los cambios.'
          : 'Indica los datos del examen. Puedes añadir la nota más adelante.'}
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
          aria-label="Datos del examen"
        >
          <label className="campus-field campus-field-wide">
            <span>Título</span>
            <input
              name="title"
              defaultValue={exam?.title ?? ''}
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
              {legacyCourse && exam && (
                <option value={CURRENT_COURSE}>
                  {exam.course_abbreviation ?? exam.course_name}
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
                ? exam?.course_name
                : selectedCourse?.name) ??
                'Elige una sigla para ver la asignatura.'}
            </span>
          </label>
          <label className="campus-field">
            <span>Parte</span>
            <select name="section" defaultValue={exam?.section ?? 'theory'}>
              <option value="theory">Teoría</option>
              <option value="practice">Prácticas</option>
            </select>
          </label>
          <label className="campus-field">
            <span>Estado</span>
            <select name="status" defaultValue={exam?.status ?? 'scheduled'}>
              <option value="scheduled">Programado</option>
              <option value="completed">Realizado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>
          <label className="campus-field">
            <span>Fecha del examen</span>
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
          <label className="campus-field campus-field-wide">
            <span>Temario (opcional)</span>
            <textarea
              name="topics"
              maxLength={1000}
              rows={3}
              defaultValue={exam?.topics ?? ''}
            />
          </label>

          <details className="campus-form-details campus-field-wide">
            <summary>Más detalles</summary>
            <div className="campus-form-grid">
              <label className="campus-field">
                <span>Nota (opcional, sobre 10)</span>
                <input
                  name="grade"
                  type="number"
                  min={0}
                  max={10}
                  step="0.01"
                  defaultValue={exam?.grade ?? ''}
                />
              </label>
              <label className="campus-field">
                <span>Ponderación (%, opcional)</span>
                <input
                  name="weight_percent"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  defaultValue={exam?.weight_percent ?? ''}
                />
              </label>
              <label className="campus-field">
                <span>Referencia de la ponderación</span>
                <select
                  name="weight_basis"
                  defaultValue={exam?.weight_basis ?? 'course'}
                >
                  <option value="course">Total de la asignatura</option>
                  <option value="section">
                    Solo esta parte (teoría o prácticas)
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
              : exam
                ? 'Guardar cambios'
                : 'Guardar examen'}
          </button>
          <button
            className="campus-button campus-button-secondary"
            type="button"
            disabled={pending}
            onClick={() => onCancel(checkRequired)}
          >
            {checkRequired ? 'Comprobar exámenes' : 'Cancelar'}
          </button>
        </div>
      </form>
    </section>
  )
}
