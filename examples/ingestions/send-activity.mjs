import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

async function main() {
  const [file, key] = process.argv.slice(2);
  if (!file || !key)
    throw new Error(
      "Uso: node examples/ingestions/send-activity.mjs archivo.json clave-idempotencia",
    );
  const token = process.env.SYNKRON_INGESTION_TOKEN;
  if (!token || !/^si_[a-f0-9]{64}$/.test(token))
    throw new Error(
      "Configura SYNKRON_INGESTION_TOKEN con la credencial de tu fuente.",
    );
  const base = new URL(process.env.SYNKRON_URL ?? "https://localhost:8443");
  if (
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    !["http:", "https:"].includes(base.protocol) ||
    (base.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  )
    throw new Error(
      "SYNKRON_URL debe ser un origen HTTPS o HTTP local, sin credenciales.",
    );
  const input = await readFile(file);
  if (input.byteLength > 64 * 1024)
    throw new Error("El archivo supera 64 KiB.");
  try {
    JSON.parse(input.toString("utf8"));
  } catch {
    throw new Error("El archivo no contiene JSON válido.");
  }
  const headers = { Authorization: `Bearer ${token}` };
  const response = await fetch(new URL("/api/v1/ingestions", base), {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: input,
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 202) {
    let message = "";
    try {
      const error = await response.json();
      message = JSON.stringify({
        message: error.message,
        errors: error.errors,
      });
    } catch {}
    throw new Error(`Entrada rechazada: HTTP ${response.status}. ${message}`);
  }
  const receipt = await response.json();
  if (typeof receipt.id !== "string")
    throw new Error("Respuesta de aceptación no válida.");
  console.log("Entrada aceptada:", receipt.id, "Clave:", key);
  const resultUrl = new URL(
    `/api/v1/ingestions/${encodeURIComponent(receipt.id)}`,
    base,
  );
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await fetch(resultUrl, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (result.status === 503) {
      await delay(1000);
      continue;
    }
    if (!result.ok)
      throw new Error(
        `No se pudo consultar el resultado: HTTP ${result.status}.`,
      );
    const state = await result.json();
    if (state.status === "completed") {
      console.log(JSON.stringify(state, null, 2));
      return;
    }
    if (state.status === "failed")
      throw new Error(
        `La ejecución falló: ${state.error?.code ?? "unknown_error"}.`,
      );
    await delay(1000);
  }
  throw new Error(
    `La entrada sigue en curso. Consulta /api/v1/ingestions/${receipt.id}; conserva la misma clave si reenvías.`,
  );
}
main().catch((error) => {
  if (
    error instanceof Error &&
    !(error instanceof TypeError) &&
    error.name !== "TimeoutError"
  )
    console.error(error.message);
  console.error(
    "No se pudo completar o confirmar la operación. Comprueba conexión, archivo, credencial y resultado de la entrada; conserva la misma clave para reintentar el mismo contenido.",
  );
  process.exitCode = 1;
});
