import { useEffect, useRef, useState } from 'react'
import { listExams } from './exams-client'
import ExamsTable from './ExamsTable'
import ExamForm from './ExamForm'
import RetireExamDialog from './RetireExamDialog'
import type { Exam } from './exam.types'

export default function ExamsPage() {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const [retiring, setRetiring] = useState<Exam | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{
    version: number
    exams: Exam[]
    error: string | null
  } | null>(null)
  const loading = result?.version !== retry
  const exams = loading ? [] : result.exams
  const error = loading ? null : result.error

  function closeForm(checkList: boolean) {
    setCreating(false)
    setEditing(null)
    setRetiring(null)
    if (checkList) {
      setNotice(
        'Comprueba el estado del examen en la lista antes de volver a intentarlo.',
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
    listExams(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setResult({ version: retry, exams: items, error: null })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setResult({
          version: retry,
          exams: [],
          error: 'No se pudieron cargar tus exámenes. Inténtalo de nuevo.',
        })
      })
    return () => controller.abort()
  }, [retry])

  return (
    <>
      <header className="campus-heading">
        <div>
          <p className="campus-eyebrow">Agenda académica</p>

          <h1>Mis exámenes</h1>

          <p className="campus-description">
            Organiza tus exámenes, consulta las fechas y registra sus
            resultados.
          </p>
        </div>
        <button
          ref={newButton}
          className="campus-button"
          type="button"
          disabled={creating || editing !== null || retiring !== null}
          aria-expanded={creating}
          aria-controls={creating ? 'exam-editor' : undefined}
          onClick={() => {
            setNotice(null)
            opener.current = newButton.current
            setCreating(true)
          }}
        >
          Nuevo examen
        </button>
      </header>

      {notice && (
        <p className="campus-notice" role="status">
          {notice}
        </p>
      )}
      {(creating || editing !== null) && (
        <ExamForm
          key={editing?.id ?? 'new'}
          exam={editing ?? undefined}
          onCancel={closeForm}
          onSaved={(changed) => {
            setCreating(false)
            setEditing(null)
            setNotice(
              changed
                ? editing
                  ? 'Examen actualizado.'
                  : 'Examen creado.'
                : 'No había cambios que guardar.',
            )
            if (changed) setRetry((value) => value + 1)
            restoreFocus()
          }}
        />
      )}

      <section
        className="campus-panel"
        id="exams"
        aria-labelledby="panel-title"
        aria-busy={loading}
      >
        <h2 id="panel-title">Seguimiento de exámenes</h2>

        {loading ? (
          <p role="status">Cargando exámenes…</p>
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
        ) : exams.length === 0 ? (
          <p role="status">Todavía no tienes exámenes registrados.</p>
        ) : (
          <ExamsTable
            exams={exams}
            disabled={creating || editing !== null || retiring !== null}
            onEdit={(exam, button) => {
              opener.current = button
              setNotice(null)
              setEditing(exam)
            }}
            onRetire={(exam, button) => {
              opener.current = button
              setNotice(null)
              setRetiring(exam)
            }}
          />
        )}
      </section>
      {retiring && (
        <RetireExamDialog
          key={retiring.id}
          exam={retiring}
          onCancel={closeForm}
          onRetired={() => {
            setRetiring(null)
            setNotice('Examen retirado.')
            setRetry((value) => value + 1)
            restoreFocus()
          }}
        />
      )}
    </>
  )
}
