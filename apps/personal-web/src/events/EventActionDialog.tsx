import { useEffect, useRef, useState } from "react";
import { needsListCheck, retireEvent, updateEvent } from "./event-client";
import type { PersonalEvent } from "./event.types";

export default function EventActionDialog({
  event,
  action,
  onDone,
  onClose,
}: {
  event: PersonalEvent;
  action: "cancel" | "retire";
  onDone: () => void;
  onClose: (checkList: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null),
    request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false),
    [checkRequired, setCheckRequired] = useState(false),
    [error, setError] = useState<string | null>(null);
  const retiring = action === "retire";
  useEffect(() => {
    const dialog = dialogRef.current,
      overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      request.current?.abort();
      dialog?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  async function confirm() {
    if (pending || checkRequired || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      if (retiring) await retireEvent(event.id, controller.signal);
      else
        await updateEvent(event.id, { status: "cancelled" }, controller.signal);
      if (!controller.signal.aborted) onDone();
    } catch (cause) {
      if (controller.signal.aborted) return;
      setCheckRequired(needsListCheck(cause));
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el cambio.",
      );
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className="personal-dialog"
      aria-labelledby="action-title"
      aria-describedby="action-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose(checkRequired);
      }}
    >
      <p className="personal-eyebrow">
        {retiring ? "Retirar compromiso" : "Cambio de planes"}
      </p>
      <h2 id="action-title">
        {retiring ? "Retirar compromiso" : "Cancelar compromiso"}
      </h2>
      <p id="action-description">
        {retiring ? (
          <>
            ¿Quieres retirar <strong>«{event.title}»</strong>? Dejará de
            aparecer en tu lista de compromisos.
          </>
        ) : (
          <>
            ¿Quieres cancelar <strong>«{event.title}»</strong>? Seguirá en tu
            lista con el estado Cancelado.
          </>
        )}
      </p>
      {error && (
        <p className="personal-error" role="alert">
          {error}
        </p>
      )}
      <div className="personal-actions">
        <button
          className="personal-button personal-button-secondary"
          type="button"
          disabled={pending}
          autoFocus
          onClick={() => onClose(checkRequired)}
        >
          {checkRequired ? "Comprobar lista" : "Volver"}
        </button>
        <button
          className={`personal-button ${retiring ? "personal-button-danger" : ""}`}
          type="button"
          disabled={pending || checkRequired}
          onClick={() => {
            void confirm();
          }}
        >
          {pending
            ? "Guardando…"
            : retiring
              ? "Retirar compromiso"
              : "Confirmar cancelación"}
        </button>
      </div>
    </dialog>
  );
}
