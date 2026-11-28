import { useEffect, useRef, useState } from 'react'
import { listAssignments } from '../assignments/assignments-client'
import { listExams } from '../exams/exams-client'
import CourseDashboard from './CourseDashboard'
import { groupCourses, type CourseGroup } from './course-groups'

export default function CoursesPage() {
  const selector = useRef<HTMLSelectElement>(null)
  const focusAfterRefresh = useRef(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<{
    version: number
    courses: CourseGroup[]
    error: string | null
  } | null>(null)
  const loading = result?.version !== retry
  const courses = loading ? [] : result.courses
  const error = loading ? null : result.error
  const course = courses.find((item) => item.id === selected) ?? courses[0]

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([listAssignments(controller.signal), listExams(controller.signal)])
      .then(([assignments, exams]) => {
        if (controller.signal.aborted) return
        setResult({ version: retry, courses: groupCourses(assignments, exams), error: null })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setResult({ version: retry, courses: [],
          error: 'No se pudieron cargar los datos de tus asignaturas. Inténtalo de nuevo.' })
      })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    if (!loading && focusAfterRefresh.current) {
      selector.current?.focus()
      focusAfterRefresh.current = false
    }
  }, [loading])

  return (
    <>
      {notice && <p className="campus-notice" role="status">{notice}</p>}
      <section aria-label="Resumen por asignaturas" aria-busy={loading}>
        {loading ? <p role="status">Cargando asignaturas…</p> : error ? (
          <div className="campus-panel">
            <p className="campus-error" role="alert">{error}</p>
            <button className="campus-button" type="button" onClick={() => setRetry((value) => value + 1)}>
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <div className="campus-course-toolbar">
              <label className="campus-field" htmlFor="course-selector">
                <span>Asignatura</span>
                <select ref={selector} id="course-selector" disabled={activityOpen} value={course?.id ?? ''} onChange={(event) => { setSelected(event.target.value); setNotice(null) }}>
                  {courses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.abbreviation ? `${item.abbreviation} · ` : ''}{item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {course && <CourseDashboard
              key={course.id}
              course={course}
              onActivityChange={(value) => {
                setActivityOpen(value)
                setNotice(null)
              }}
              onChanged={(message) => {
                setNotice(message)
                focusAfterRefresh.current = true
                setRetry((value) => value + 1)
              }}
              onSubmitted={(id) => {
                setResult((current) => current && ({
                  ...current,
                  courses: current.courses.map((item) => ({
                    ...item,
                    assignments: item.assignments.map((assignment) => assignment.id === id
                      ? { ...assignment, status: 'submitted' }
                      : assignment),
                  })),
                }))
                setNotice('Entrega marcada como entregada.')
              }}
              onRefresh={() => {
                setNotice('Comprueba el estado de la actividad antes de volver a intentarlo.')
                focusAfterRefresh.current = true
                setRetry((value) => value + 1)
              }}
            />}
          </>
        )}
      </section>
    </>
  )
}
