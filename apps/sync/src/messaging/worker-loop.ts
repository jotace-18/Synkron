import { setTimeout as delay } from 'node:timers/promises';

export async function runWorkerLoop(
  runOnce: () => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await runOnce();
      if (signal.aborted) return;
      throw new Error('El worker terminó sin solicitarse una parada');
    } catch {
      if (signal.aborted) return;
      console.error(
        'El worker perdió la conexión o falló; reintentará en 5 segundos',
      );
    }

    try {
      await delay(5_000, undefined, { signal });
    } catch (error: unknown) {
      if (signal.aborted) return;
      throw error;
    }
  }
}
