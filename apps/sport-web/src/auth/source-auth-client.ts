function expired() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("source-session-expired"));
}
export async function sourceFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)])
    : AbortSignal.timeout(10000);
  const headers = new Headers(options.headers);
  if (!["GET", "HEAD"].includes(method)) {
    const response = await fetch("/api/v1/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!response.ok)
      throw new Error("No se pudo obtener la protección de la sesión.");
    const value: unknown = await response.json();
    if (
      !value ||
      typeof value !== "object" ||
      !("csrf_token" in value) ||
      typeof value.csrf_token !== "string"
    )
      throw new Error("Respuesta de sesión no válida.");
    headers.set("X-CSRF-Token", value.csrf_token);
  }
  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
  if (
    response.status === 401 &&
    !["/api/v1/auth/login", "/api/v1/auth/register"].includes(path)
  )
    expired();
  return response;
}
export async function authRequest(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await sourceFetch(`/api/v1/auth/${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    if (response.status === 401)
      throw new Error("Correo o contraseña no válidos, o sesión caducada.");
    if (response.status === 409)
      throw new Error("Este correo ya tiene cuenta. Inicia sesión.");
    if (response.status === 429)
      throw new Error("Demasiados intentos. Espera 15 minutos.");
    if (response.status === 422)
      throw new Error(
        "Revisa el correo y la contraseña (mínimo 8 caracteres al registrarte).",
      );
    throw new Error(
      "No se pudo confirmar la operación. Actualiza antes de volver a intentarlo.",
    );
  }
  return response.status === 204 ? null : (response.json() as Promise<unknown>);
}
export interface SourceUser {
  id: string;
  email: string;
}
export function isSourceUser(value: unknown): value is SourceUser {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "email" in value &&
    typeof value.email === "string"
  );
}
