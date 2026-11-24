import { sourceFetch } from '../auth/source-auth-client.ts';
import type { GymInput, GymSession } from "./gym.types.ts";
import { GYM_STATUSES, TRAINING_MODES } from "./gym.types.ts";
export const PAGE_SIZE = 20;
const base = "/api/v1/gym-sessions";
function isSession(value: unknown): value is GymSession {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.started_at === "string" &&
    Number.isFinite(Date.parse(item.started_at)) &&
    typeof item.end_at === "string" &&
    Number.isFinite(Date.parse(item.end_at)) &&
    typeof item.duration_minutes === "number" &&
    Number.isInteger(item.duration_minutes) &&
    item.duration_minutes > 0 &&
    TRAINING_MODES.some((mode) => mode === item.training_mode) &&
    GYM_STATUSES.some((status) => status === item.status) &&
    typeof item.accompanied === "boolean" &&
    item.deleted_at === null
  );
}
export async function listSessions(
  page: number,
  signal?: AbortSignal,
): Promise<{ sessions: GymSession[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE + 1),
    offset: String(page * PAGE_SIZE),
  });
  const response = await sourceFetch(`${base}?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new Error(
      "No se pudieron cargar tus entrenamientos. Comprueba la conexión e inténtalo de nuevo.",
    );
  });
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "No se pudo autorizar la consulta. Revisa la configuración del servicio deportivo.",
    );
  if (response.status !== 200)
    throw new Error(
      "No se pudieron cargar tus entrenamientos. Inténtalo de nuevo.",
    );
  const items: unknown = await response.json().catch(() => {
    throw new Error("El servicio ha devuelto una respuesta inesperada.");
  });
  if (
    !Array.isArray(items) ||
    items.length > PAGE_SIZE + 1 ||
    !items.every(isSession)
  )
    throw new Error("El servicio ha devuelto una respuesta inesperada.");
  return {
    sessions: items.slice(0, PAGE_SIZE),
    hasMore: items.length > PAGE_SIZE,
  };
}
export class UnconfirmedGymError extends Error {
  constructor() {
    super(
      "No se pudo confirmar la operación. Comprueba la lista antes de volver a intentarlo.",
    );
    this.name = "UnconfirmedGymError";
  }
}
export class GymUnavailableError extends Error {
  constructor() {
    super("El entrenamiento ya no está disponible. Actualiza la lista.");
    this.name = "GymUnavailableError";
  }
}
export const needsListCheck = (error: unknown) =>
  error instanceof UnconfirmedGymError || error instanceof GymUnavailableError;
async function writeSession(
  method: "POST" | "PATCH" | "DELETE",
  id?: string,
  input?: Partial<GymInput>,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await sourceFetch(id ? `${base}/${encodeURIComponent(id)}` : base, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: input ? { "Content-Type": "application/json" } : undefined,
      body: input ? JSON.stringify(input) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    });
  } catch {
    throw new UnconfirmedGymError();
  }
  if (response.status === { POST: 201, PATCH: 200, DELETE: 204 }[method])
    return;
  if (response.status >= 500) throw new UnconfirmedGymError();
  if (response.status === 404) throw new GymUnavailableError();
  if (response.status === 422)
    throw new Error(
      "Revisa la fecha, hora, duración, modalidad y estado del entrenamiento.",
    );
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "No se pudo autorizar la operación. Inténtalo de nuevo más tarde.",
    );
  throw new Error("No se pudo guardar el cambio. Inténtalo de nuevo.");
}
export const createSession = (input: GymInput, signal?: AbortSignal) =>
  writeSession("POST", undefined, input, signal);
export const updateSession = (
  id: string,
  input: Partial<GymInput>,
  signal?: AbortSignal,
) =>
  Object.keys(input).length
    ? writeSession("PATCH", id, input, signal)
    : Promise.resolve();
export const retireSession = (id: string, signal?: AbortSignal) =>
  writeSession("DELETE", id, undefined, signal);
