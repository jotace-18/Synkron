import { useEffect, useRef, useState } from 'react'
import {
  updateAssignment,
  UnconfirmedAssignmentError,
  AssignmentUnavailableError,
} from './assignments-client'
import type { Assignment } from './assignment.types'

interface SubmitAssignmentDialogProps {
  assignment: Assignment
  onSubmitted: () => void
  onCancel: (checkList: boolean) => void
}

export default function SubmitAssignmentDialog({
  assignment,
  onSubmitted,
  onCancel,
}: SubmitAssignmentDialogProps) {
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

  async function confirmSubmission() {
    if (pending || checkRequired || request.current) return
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    try {
      await updateAssignment(assignment.id, { status: 'submitted' }, controller.signal)
      if (!controller.signal.aborted) onSubmitted()
    } catch (cause) {
      if (controller.signal.aborted) return
      setCheckRequired(
        cause instanceof UnconfirmedAssignmentError ||
          cause instanceof AssignmentUnavailableError,
      )
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo marcar la entrega como entregada.',
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
      aria-labelledby="submit-title"
      aria-describedby="submit-description"
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onCancel(checkRequired)
      }}
    >
      <h2 id="submit-title">Marcar como entregada</h2>
      <p id="submit-description">
        ¿Quieres marcar <strong>«{assignment.title}»</strong> como entregada?
        Pasará al historial de entregas realizadas de esta asignatura.
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
          {checkRequired ? 'Comprobar entregas' : 'Cancelar'}
        </button>
        <button
          className="campus-button"
          type="button"
          disabled={pending || checkRequired}
          onClick={() => {
            void confirmSubmission()
          }}
        >
          {pending ? 'Guardando…' : 'Marcar como entregada'}
        </button>
      </div>
    </dialog>
  )
}
