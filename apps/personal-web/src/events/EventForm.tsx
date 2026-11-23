import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { createEvent, updateEvent, needsListCheck } from "./event-client";
import {
  eventPatch,
  readEventForm,
  eventDateLabel,
  eventTimeLabel,
} from "./event-form";
import { madridFields } from "./event-time";
import {
  EVENT_STATUSES,
  STATUS_LABELS,
  type EventInput,
  type PersonalEvent,
} from "./event.types";

export default function EventForm({
  event,
  onSaved,
  onClose,
}: {
  event?: PersonalEvent;
  onSaved: (changed: boolean) => void;
  onClose: (checkList: boolean) => void;
}) {
  const initial = event?.started_at
    ? madridFields(event.started_at)
    : {
        date: event?.on_date ?? madridFields(new Date().toISOString()).date,
        time: "",
      };
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(initial.date),
    [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(
    String(event?.duration_minutes ?? ""),
  );
  const [people, setPeople] = useState(event?.people.join("\n") ?? "");
  const [status, setStatus] = useState(event?.status ?? "pending");
  const [pending, setPending] = useState(false),
    [checkRequired, setCheckRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null),
    firstField = useRef<HTMLInputElement>(null),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    firstField.current?.focus();
    return () => request.current?.abort();
  }, []);
  let preview = "Añade un asunto y un día para organizar tu compromiso.";
  try {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      title,
      date,
      time,
      duration_minutes: duration,
      people,
      status,
    }))
      data.set(key, value);
    const input = readEventForm(data, event);
    preview = `${eventDateLabel(input)} · ${eventTimeLabel(input)}${input.people.length ? ` · ${input.people.length} ${input.people.length === 1 ? "persona" : "personas"}` : ""}`;
  } catch {
    /* Report incomplete fields only on submission. */
  }
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || checkRequired || request.current) return;
    let input: EventInput;
    try {
      input = readEventForm(new FormData(e.currentTarget), event);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Revisa los datos del compromiso.",
      );
      window.requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      const patch = event ? eventPatch(input, event) : null;
      if (event && patch) await updateEvent(event.id, patch, controller.signal);
      else await createEvent(input, controller.signal);
      if (!controller.signal.aborted)
        onSaved(patch === null || Object.keys(patch).length > 0);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setCheckRequired(needsListCheck(cause));
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el compromiso.",
      );
      window.requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return (
    <section
      className="personal-panel personal-editor"
      id="event-editor"
      aria-labelledby="editor-title"
    >
      <div className="personal-panel-heading">
        <div>
          <p className="personal-eyebrow">Un espacio para tus planes</p>
          <h2 id="editor-title">
            {event ? "Editar compromiso" : "Nuevo compromiso"}
          </h2>
        </div>
        <span className="personal-editor-tag">Otros</span>
      </div>
      <form onSubmit={submit} aria-busy={pending}>
        <fieldset
          className="personal-form-grid"
          disabled={pending || checkRequired}
        >
          <legend className="visually-hidden">Datos del compromiso</legend>
          <label className="personal-field personal-field-wide">
            <span>Asunto</span>
            <input
              ref={firstField}
              name="title"
              required
              maxLength={200}
              placeholder="Ir a comprar, cita en la peluquería, cena con amigos…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="personal-field">
            <span>Día</span>
            <input
              name="date"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="personal-field">
            <span>
              Hora · Madrid <small>Opcional</small>
            </span>
            <input
              name="time"
              type="time"
              step={60}
              value={time}
              aria-describedby="time-hint"
              onChange={(e) => {
                setTime(e.target.value);
                if (!e.target.value) setDuration("");
              }}
            />
            <small id="time-hint">
              Déjala vacía si todavía no sabes la hora.
            </small>
          </label>
          <label className="personal-field">
            <span>
              Duración (minutos) <small>Opcional</small>
            </span>
            <input
              name="duration_minutes"
              type="number"
              min={1}
              max={2_147_483_647}
              step={1}
              disabled={!time}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder={
                time ? "Sin duración indicada" : "Primero indica una hora"
              }
            />
          </label>
          <label className="personal-field">
            <span>Estado</span>
            <select
              name="status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as EventInput["status"])
              }
            >
              {EVENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="personal-field personal-field-wide">
            <span>
              Personas <small>Opcional</small>
            </span>
            <textarea
              name="people"
              rows={3}
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              placeholder={"Ana\nLuis"}
              aria-describedby="people-hint"
            />
            <small id="people-hint">
              Un nombre por línea, hasta 50 personas. No se envían invitaciones.
            </small>
          </label>
        </fieldset>
        <div className="personal-event-preview">
          <span className="personal-preview-mark" aria-hidden="true">
            ◇
          </span>
          <div>
            <strong>{title.trim() || "Tu próximo compromiso"}</strong>
            <p>{preview}</p>
          </div>
        </div>
        <p className="personal-form-hint">
          Horarios de Madrid. Al quitar la hora se elimina también la duración.
          En una hora repetida por el cambio de horario se usa la primera
          aparición.
        </p>
        {error && (
          <p
            ref={errorRef}
            className="personal-error"
            role="alert"
            tabIndex={-1}
          >
            {error}
          </p>
        )}
        <div className="personal-actions">
          <button
            className="personal-button"
            disabled={pending || checkRequired}
          >
            {pending
              ? "Guardando…"
              : event
                ? "Guardar cambios"
                : "Guardar compromiso"}
          </button>
          <button
            className="personal-button personal-button-secondary"
            type="button"
            disabled={pending}
            onClick={() => onClose(checkRequired)}
          >
            {checkRequired ? "Comprobar lista" : "Volver"}
          </button>
        </div>
      </form>
    </section>
  );
}
