import { useEffect, useRef, useState } from 'react'
import {
  retireExam,
  UnconfirmedExamError,
  ExamUnavailableError,
} from './exams-client'
import type { Exam } from './exam.types'

interface RetireExamDialogProps {
  exam: Exam
  actionLabel?: 'Retirar' | 'Eliminar'
  onRetired: () => void
  onCancel: (checkList: boolean) => void
}

export default function RetireExamDialog({
  exam,
  actionLabel = 'Retirar',
  onRetired,
  onCancel,
}: RetireExamDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const request = useRef<AbortController | null>(null)
  const [pending, setPending] = useState(false)
  const [checkRequired, setCheckRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      request.current?.abort()
      dialog?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  async function confirmRetirement() {
    if (pending || checkRequired || request.current) return
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    try {
      await retireExam(exam.id, controller.signal)
      if (!controller.signal.aborted) onRetired()
    } catch (cause) {
      if (controller.signal.aborted) return
      setCheckRequired(
        cause instanceof UnconfirmedExamError ||
          cause instanceof ExamUnavailableError,
      )
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo retirar el examen.',
      )
    } finally {
      request.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="campus-dialog"
      aria-labelledby="retire-title"
      aria-describedby="retire-description"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onCancel(checkRequired)
      }}
    >
      <h2 id="retire-title">{actionLabel} examen</h2>
      <p id="retire-description">
        ¿Quieres {actionLabel.toLocaleLowerCase('es')} <strong>«{exam.title}»</strong>? Dejará de aparecer en
        Campus y se retirará de Synkron en la siguiente sincronización.
      </p>
      {error && (
        <p className="campus-error" role="alert">
          {error}
        </p>
      )}
      <div className="campus-form-actions">
        <button
          className="campus-button campus-button-secondary"
          type="button"
          disabled={pending}
          autoFocus
          onClick={() => onCancel(checkRequired)}
        >
          {checkRequired ? 'Comprobar exámenes' : 'Cancelar'}
        </button>
        <button
          className="campus-button campus-button-danger"
          type="button"
          disabled={pending || checkRequired}
          onClick={() => {
            void confirmRetirement()
          }}
        >
          {pending ? (actionLabel === 'Eliminar' ? 'Eliminando…' : 'Retirando…') : `${actionLabel} examen`}
        </button>
      </div>
    </dialog>
  )
}
