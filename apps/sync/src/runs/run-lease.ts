import { setTimeout as delay } from 'node:timers/promises';
import type { ClaimedSyncRun } from './run.types';
import type { RunsService } from './runs.service';

export class RunLeaseLostError extends Error {
  constructor() {
    super('Se perdió la reserva de la ejecución');
  }
}

export async function maintainRunLease(
  run: ClaimedSyncRun,
  runs: RunsService,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await delay(20_000, undefined, { signal });
    } catch (error: unknown) {
      if (signal.aborted) return;
      throw error;
    }

    if (signal.aborted) return;

    const renewed = await runs.renewLease(
      run.tenant_id,
      run.id,
      run.claim_token,
    );

    if (!renewed) {
      throw new RunLeaseLostError();
    }
  }
}
