import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { createSession, updateSession, needsListCheck } from "./gym-client";
import { gymPatch, readGymForm } from "./gym-form";
import {
  madridFields,
  sessionEnd,
  dateLabel,
  timeLabel,
  durationLabel,
} from "./gym-time";
import {
  MODE_LABELS,
  STATUS_LABELS,
  TRAINING_MODES,
  GYM_STATUSES,
  type GymInput,
  type GymSession,
} from "./gym.types";

export default function GymForm({
  session,
  onSaved,
  onClose,
}: {
  session?: GymSession;
  onSaved: (changed: boolean) => void;
  onClose: (checkList: boolean) => void;
}) {
  const initial = session
    ? madridFields(session.started_at)
    : { date: madridFields(new Date().toISOString()).date, time: "" };
  const [date, setDate] = useState(initial.date),
    [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(
    String(session?.duration_minutes ?? 60),
  );
  const [mode, setMode] = useState(session?.training_mode ?? "push");
  const [company, setCompany] = useState(
    session?.accompanied ? "accompanied" : "solo",
  );
  const [status, setStatus] = useState(session?.status ?? "scheduled");
  const [pending, setPending] = useState(false),
    [checkRequired, setCheckRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null),
    errorRef = useRef<HTMLParagraphElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstField.current?.focus();
    return () => request.current?.abort();
  }, []);

  let preview =
    "Elige la fecha y la hora para ver cuándo termina tu entrenamiento.";
  try {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      date,
      time,
      duration_minutes: duration,
      training_mode: mode,
      company,
      status,
    }))
      data.set(key, value);
    const input = readGymForm(data, session);
    const end = sessionEnd(input.started_at, input.duration_minutes);
    preview = `${dateLabel(input.started_at)} · ${timeLabel(input.started_at)} → ${timeLabel(end)}${madridFields(input.started_at).date !== madridFields(end).date ? ` del ${dateLabel(end)}` : ""} · ${durationLabel(input.duration_minutes)}`;
  } catch {
    /* Incomplete fields are reported on submission, not while typing. */
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || checkRequired || request.current) return;
    let input: GymInput;
    try {
      input = readGymForm(new FormData(event.currentTarget), session);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Revisa los datos del entrenamiento.",
      );
      window.requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      const patch = session ? gymPatch(input, session) : null;
      if (session && patch)
        await updateSession(session.id, patch, controller.signal);
      else await createSession(input, controller.signal);
      if (!controller.signal.aborted)
        onSaved(patch === null || Object.keys(patch).length > 0);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setCheckRequired(needsListCheck(cause));
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el entrenamiento.",
      );
      window.requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <section
      className="sport-panel sport-editor"
      id="gym-editor"
      aria-labelledby="editor-title"
    >
      <div className="sport-panel-heading">
        <div>
          <p className="sport-eyebrow">Datos del entrenamiento</p>
          <h2 id="editor-title">
            {session ? "Editar entrenamiento" : "Nuevo entrenamiento"}
          </h2>
        </div>
        <span className="sport-editor-tag">Gimnasio</span>
      </div>
      <form onSubmit={submit} aria-busy={pending}>
        <fieldset
          className="sport-form-grid"
          disabled={pending || checkRequired}
        >
          <legend className="visually-hidden">Datos del entrenamiento</legend>
          <label className="sport-field">
            <span>Fecha</span>
            <input
              ref={firstField}
              name="date"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="sport-field">
            <span>Hora de inicio · Madrid</span>
            <input
              name="time"
              type="time"
              required
              step={60}
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
          <label className="sport-field">
            <span>Duración (minutos)</span>
            <input
              name="duration_minutes"
              type="number"
              min={1}
              max={2_147_483_647}
              step={1}
              required
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </label>
          <label className="sport-field">
            <span>Modalidad</span>
            <select
              name="training_mode"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as GymInput["training_mode"])
              }
            >
              {TRAINING_MODES.map((value) => (
                <option key={value} value={value}>
                  {MODE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="sport-field">
            <span>Compañía</span>
            <select
              name="company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            >
              <option value="solo">Solo</option>
              <option value="accompanied">Acompañado</option>
            </select>
          </label>
          <label className="sport-field">
            <span>Estado</span>
            <select
              name="status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as GymInput["status"])
              }
            >
              {GYM_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <div className="sport-session-preview">
          <span className="sport-preview-mark" aria-hidden="true">
            ↗
          </span>
          <div>
            <strong>Gimnasio · {MODE_LABELS[mode]}</strong>
            <p>{preview}</p>
          </div>
        </div>
        <p className="sport-form-hint">
          Horarios de Madrid. Si una hora se repite al cambiar al horario de
          invierno, se usa su primera aparición.
        </p>
        {error && (
          <p ref={errorRef} className="sport-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        )}
        <div className="sport-actions">
          <button
            className="sport-button"
            type="submit"
            disabled={pending || checkRequired}
          >
            {pending
              ? "Guardando…"
              : session
                ? "Guardar cambios"
                : "Guardar entrenamiento"}
          </button>
          <button
            className="sport-button sport-button-secondary"
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
