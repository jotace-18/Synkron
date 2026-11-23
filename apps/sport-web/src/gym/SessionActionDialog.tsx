import { useEffect, useRef, useState } from "react";
import { needsListCheck, retireSession, updateSession } from "./gym-client";
import type { GymSession } from "./gym.types";

export default function SessionActionDialog({
  session,
  action,
  onDone,
  onClose,
}: {
  session: GymSession;
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
      if (retiring) await retireSession(session.id, controller.signal);
      else
        await updateSession(
          session.id,
          { status: "cancelled" },
          controller.signal,
        );
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
      className="sport-dialog"
      aria-labelledby="action-title"
      aria-describedby="action-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose(checkRequired);
      }}
    >
      <p className="sport-eyebrow">
        {retiring ? "Retirar sesión" : "Cambio de planes"}
      </p>
      <h2 id="action-title">
        {retiring ? "Retirar entrenamiento" : "Cancelar entrenamiento"}
      </h2>
      <p id="action-description">
        {retiring ? (
          <>
            ¿Quieres retirar <strong>«{session.title}»</strong>? Dejará de
            aparecer en tu lista de entrenamientos.
          </>
        ) : (
          <>
            ¿Quieres cancelar <strong>«{session.title}»</strong>? Seguirá en tu
            lista con el estado Cancelado.
          </>
        )}
      </p>
      {error && (
        <p className="sport-error" role="alert">
          {error}
        </p>
      )}
      <div className="sport-actions">
        <button
          className="sport-button sport-button-secondary"
          type="button"
          disabled={pending}
          autoFocus
          onClick={() => onClose(checkRequired)}
        >
          {checkRequired ? "Comprobar lista" : "Volver"}
        </button>
        <button
          className={`sport-button ${retiring ? "sport-button-danger" : ""}`}
          type="button"
          disabled={pending || checkRequired}
          onClick={() => {
            void confirm();
          }}
        >
          {pending
            ? "Guardando…"
            : retiring
              ? "Retirar entrenamiento"
              : "Confirmar cancelación"}
        </button>
      </div>
    </dialog>
  );
}
