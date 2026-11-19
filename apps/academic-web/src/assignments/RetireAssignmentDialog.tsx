import { useEffect, useRef, useState } from 'react'
import {
  retireAssignment,
  UnconfirmedAssignmentError,
  AssignmentUnavailableError,
} from './assignments-client'
import type { Assignment } from './assignment.types'

interface RetireAssignmentDialogProps {
  assignment: Assignment
  onRetired: () => void
  onCancel: (checkList: boolean) => void
}

export default function RetireAssignmentDialog({
  assignment,
  onRetired,
  onCancel,
}: RetireAssignmentDialogProps) {
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
      await retireAssignment(assignment.id, controller.signal)
      if (!controller.signal.aborted) onRetired()
    } catch (cause) {
      if (controller.signal.aborted) return
      setCheckRequired(
        cause instanceof UnconfirmedAssignmentError ||
          cause instanceof AssignmentUnavailableError,
      )
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo retirar la entrega.',
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
      <h2 id="retire-title">Retirar entrega</h2>
      <p id="retire-description">
        ¿Quieres retirar <strong>«{assignment.title}»</strong>? Dejará de
        aparecer en Campus y se retirará de Synkron en la siguiente
        sincronización.
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
          className="campus-button campus-button-danger"
          type="button"
          disabled={pending || checkRequired}
          onClick={() => {
            void confirmRetirement()
          }}
        >
          {pending ? 'Retirando…' : 'Retirar entrega'}
        </button>
      </div>
    </dialog>
  )
}
