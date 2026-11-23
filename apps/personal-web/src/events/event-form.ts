import {
  EVENT_STATUSES,
  type EventInput,
  type PersonalEvent,
} from "./event.types.ts";
import {
  isDay,
  madridFields,
  madridInstant,
  eventEnd,
  dateLabel,
  timeLabel,
  dayLabel,
  durationLabel,
} from "./event-time.ts";
export function readEventForm(
  data: FormData,
  original?: PersonalEvent,
): EventInput {
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const title = text("title"),
    date = text("date"),
    time = text("time"),
    durationText = text("duration_minutes");
  if (!title || [...title].length > 200)
    throw new Error("Indica un asunto de entre 1 y 200 caracteres.");
  if (!isDay(date)) throw new Error("Indica un día válido.");
  const duration = durationText ? Number(durationText) : null;
  if (
    duration !== null &&
    (!Number.isInteger(duration) || duration < 1 || duration > 2_147_483_647)
  )
    throw new Error(
      "La duración debe ser un número entero positivo de minutos.",
    );
  if (!time && duration !== null)
    throw new Error("Añade una hora para indicar duración.");
  const status = EVENT_STATUSES.find((value) => value === text("status"));
  if (!status) throw new Error("Selecciona un estado válido.");
  const people = text("people")
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (people.length > 50 || people.some((name) => [...name].length > 100))
    throw new Error(
      "Puedes añadir hasta 50 personas, con nombres de hasta 100 caracteres.",
    );
  const previous = original?.started_at
    ? madridFields(original.started_at)
    : null;
  const start = !time
    ? null
    : original?.started_at && previous?.date === date && previous.time === time
      ? original.started_at
      : madridInstant(date, time);
  if (start && duration !== null) eventEnd(start, duration);
  return {
    title,
    on_date: start === null ? date : null,
    started_at: start,
    duration_minutes: duration,
    people,
    status,
  };
}
export function eventPatch(
  input: EventInput,
  original: PersonalEvent,
): Partial<EventInput> {
  const patch: Partial<EventInput> = {};
  for (const field of Object.keys(input) as (keyof EventInput)[]) {
    if (JSON.stringify(input[field]) !== JSON.stringify(original[field]))
      Object.assign(patch, { [field]: input[field] });
  }
  return patch;
}
export function eventDateLabel(event: EventInput): string {
  return event.on_date ? dayLabel(event.on_date) : dateLabel(event.started_at!);
}
export function eventTimeLabel(event: EventInput): string {
  if (!event.started_at) return "Sin hora";
  if (event.duration_minutes === null) return timeLabel(event.started_at);
  const end = eventEnd(event.started_at, event.duration_minutes);
  return `${timeLabel(event.started_at)} – ${timeLabel(end)}${madridFields(event.started_at).date !== madridFields(end).date ? ` · ${dateLabel(end)}` : ""} · ${durationLabel(event.duration_minutes)}`;
}
