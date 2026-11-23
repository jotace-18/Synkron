import ExamsPage from './exams/ExamsPage'
import { useEffect, useRef, useState } from 'react'
import { listAssignments } from './assignments/assignments-client'
import AssignmentsTable from './assignments/AssignmentsTable'
import AssignmentForm from './assignments/AssignmentForm'
import RetireAssignmentDialog from './assignments/RetireAssignmentDialog'
import type { Assignment } from './assignments/assignment.types'
import './App.css'

function App() {
  const [view, setView] = useState<'assignments' | 'exams'>('assignments')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Assignment | null>(null)
  const [retiring, setRetiring] = useState<Assignment | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{
    version: number
    assignments: Assignment[]
    error: string | null
  } | null>(null)
  const loading = result?.version !== retry
  const assignments = loading ? [] : result.assignments
  const error = loading ? null : result.error

  function closeForm(checkList: boolean) {
    setCreating(false)
    setEditing(null)
    setRetiring(null)
    if (checkList) {
      setNotice(
        'Comprueba el estado de la entrega en la lista antes de volver a intentarlo.',
      )
      setRetry((value) => value + 1)
    }
    restoreFocus()
  }

  function restoreFocus() {
    window.requestAnimationFrame(() => {
      const target = opener.current?.isConnected
        ? opener.current
        : newButton.current
      target?.focus()
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    listAssignments(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setResult({ version: retry, assignments: items, error: null })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setResult({
          version: retry,
          assignments: [],
          error: 'No se pudieron cargar tus entregas. Inténtalo de nuevo.',
        })
      })
    return () => controller.abort()
  }, [retry])

  return (
    <div className="campus-shell">
      <aside className="campus-sidebar">
        <div className="campus-brand">
          <span className="campus-mark" aria-hidden="true">
            C
          </span>
          <div>
            <strong>Campus</strong>
            <span>Agenda académica</span>
          </div>
        </div>

        <nav className="campus-navigation" aria-label="Secciones">
          <button type="button" disabled={creating || editing !== null || retiring !== null} aria-current={view === 'assignments' ? 'page' : undefined} onClick={() => setView('assignments')}>Entregas</button>
          <button type="button" disabled={creating || editing !== null || retiring !== null} aria-current={view === 'exams' ? 'page' : undefined} onClick={() => setView('exams')}>Exámenes</button>
        </nav>

        <p className="campus-sidebar-note">
          Tu espacio para organizar el curso.
        </p>
      </aside>

      <main className="campus-main">
        {view === 'exams' ? <ExamsPage /> : <>
        <header className="campus-heading">
          <div>
            <p className="campus-eyebrow">Agenda académica</p>

            <h1>Mis entregas</h1>

            <p className="campus-description">
              Organiza tus trabajos, consulta los vencimientos y lleva al día
              tus entregas.
            </p>
          </div>
          <button
            ref={newButton}
            className="campus-button"
            type="button"
            disabled={creating || editing !== null || retiring !== null}
            aria-expanded={creating}
            aria-controls={creating ? 'assignment-editor' : undefined}
            onClick={() => {
              setNotice(null)
              opener.current = newButton.current
              setCreating(true)
            }}
          >
            Nueva entrega
          </button>
        </header>

        {notice && (
          <p className="campus-notice" role="status">
            {notice}
          </p>
        )}
        {(creating || editing !== null) && (
          <AssignmentForm
            key={editing?.id ?? 'new'}
            assignment={editing ?? undefined}
            onCancel={closeForm}
            onSaved={(changed) => {
              setCreating(false)
              setEditing(null)
              setNotice(
                changed
                  ? editing
                    ? 'Entrega actualizada.'
                    : 'Entrega creada.'
                  : 'No había cambios que guardar.',
              )
              if (changed) setRetry((value) => value + 1)
              restoreFocus()
            }}
          />
        )}

        <section
          className="campus-panel"
          id="assignments"
          aria-labelledby="panel-title"
          aria-busy={loading}
        >
          <h2 id="panel-title">Seguimiento de entregas</h2>

          {loading ? (
            <p role="status">Cargando entregas…</p>
          ) : error ? (
            <>
              <p className="campus-error" role="alert">
                {error}
              </p>
              <button
                className="campus-button"
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Reintentar
              </button>
            </>
          ) : assignments.length === 0 ? (
            <p role="status">Todavía no tienes entregas registradas.</p>
          ) : (
            <AssignmentsTable
              assignments={assignments}
              disabled={creating || editing !== null || retiring !== null}
              onEdit={(assignment, button) => {
                opener.current = button
                setNotice(null)
                setEditing(assignment)
              }}
              onRetire={(assignment, button) => {
                opener.current = button
                setNotice(null)
                setRetiring(assignment)
              }}
            />
          )}
        </section>
        </>}
      </main>
      {retiring && (
        <RetireAssignmentDialog
          key={retiring.id}
          assignment={retiring}
          onCancel={closeForm}
          onRetired={() => {
            setRetiring(null)
            setNotice('Entrega retirada.')
            setRetry((value) => value + 1)
            restoreFocus()
          }}
        />
      )}
    </div>
  )
}

export default App
