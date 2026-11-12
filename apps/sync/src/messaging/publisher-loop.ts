import { setTimeout as delay } from 'node:timers/promises';

export async function runPublisherLoop(
  publishNext: () => Promise<boolean>,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const published = await publishNext();

    if (!published && !signal.aborted) {
      try {
        await delay(1000, undefined, { signal });
      } catch (error: unknown) {
        if (!signal.aborted) {
          throw error;
        }
      }
    }
  }
}
