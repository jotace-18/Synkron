import { isDay } from "./event-time.ts";
import type { EventInput, PersonalEvent } from "./event.types.ts";
import { EVENT_STATUSES } from "./event.types.ts";
export const PAGE_SIZE = 20;
const base = "/api/v1/events";
function isEvent(value: unknown): value is PersonalEvent {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const day = typeof item.on_date === "string" && isDay(item.on_date);
  const instant =
    typeof item.started_at === "string" &&
    Number.isFinite(Date.parse(item.started_at));
  const duration = item.duration_minutes;
  const schedule = day
    ? item.started_at === null && duration === null && item.end_at === null
    : item.on_date === null &&
      instant &&
      (duration === null
        ? item.end_at === null
        : typeof duration === "number" &&
          Number.isInteger(duration) &&
          duration > 0 &&
          duration <= 2_147_483_647 &&
          typeof item.end_at === "string" &&
          Date.parse(item.end_at) ===
            Date.parse(item.started_at as string) + duration * 60_000);
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    schedule &&
    Array.isArray(item.people) &&
    item.people.length <= 50 &&
    item.people.every(
      (person: unknown) =>
        typeof person === "string" &&
        person.trim().length > 0 &&
        [...person].length <= 100,
    ) &&
    EVENT_STATUSES.some((status) => status === item.status) &&
    item.deleted_at === null &&
    typeof item.created_at === "string" &&
    typeof item.updated_at === "string"
  );
}
export async function listEvents(
  page: number,
  signal?: AbortSignal,
): Promise<{ events: PersonalEvent[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE + 1),
    offset: String(page * PAGE_SIZE),
  });
  const response = await fetch(`${base}?${params}`, {
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new Error(
      "No se pudieron cargar tus compromisos. Comprueba la conexión e inténtalo de nuevo.",
    );
  });
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "No se pudo autorizar la consulta. Revisa la configuración del servicio personal.",
    );
  if (response.status !== 200)
    throw new Error(
      "No se pudieron cargar tus compromisos. Inténtalo de nuevo.",
    );
  const items: unknown = await response.json().catch(() => {
    throw new Error("El servicio ha devuelto una respuesta inesperada.");
  });
  if (
    !Array.isArray(items) ||
    items.length > PAGE_SIZE + 1 ||
    !items.every(isEvent)
  )
    throw new Error("El servicio ha devuelto una respuesta inesperada.");
  return {
    events: items.slice(0, PAGE_SIZE),
    hasMore: items.length > PAGE_SIZE,
  };
}
export class UnconfirmedEventError extends Error {
  constructor() {
    super(
      "No se pudo confirmar la operación. Comprueba la lista antes de volver a intentarlo.",
    );
    this.name = "UnconfirmedEventError";
  }
}
export class EventUnavailableError extends Error {
  constructor() {
    super("El compromiso ya no está disponible. Actualiza la lista.");
    this.name = "EventUnavailableError";
  }
}
export const needsListCheck = (error: unknown) =>
  error instanceof UnconfirmedEventError ||
  error instanceof EventUnavailableError;
async function writeEvent(
  method: "POST" | "PATCH" | "DELETE",
  id?: string,
  input?: Partial<EventInput>,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(id ? `${base}/${encodeURIComponent(id)}` : base, {
      method,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: input ? { "Content-Type": "application/json" } : undefined,
      body: input ? JSON.stringify(input) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    });
  } catch {
    throw new UnconfirmedEventError();
  }
  if (response.status === { POST: 201, PATCH: 200, DELETE: 204 }[method])
    return;
  if (response.status >= 500) throw new UnconfirmedEventError();
  if (response.status === 404) throw new EventUnavailableError();
  if (response.status === 422)
    throw new Error(
      "Revisa la asunto, fecha, hora, duración, personas y estado del compromiso.",
    );
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "No se pudo autorizar la operación. Inténtalo de nuevo más tarde.",
    );
  throw new Error("No se pudo guardar el cambio. Inténtalo de nuevo.");
}
export const createEvent = (input: EventInput, signal?: AbortSignal) =>
  writeEvent("POST", undefined, input, signal);
export const updateEvent = (
  id: string,
  input: Partial<EventInput>,
  signal?: AbortSignal,
) =>
  Object.keys(input).length
    ? writeEvent("PATCH", id, input, signal)
    : Promise.resolve();
export const retireEvent = (id: string, signal?: AbortSignal) =>
  writeEvent("DELETE", id, undefined, signal);
