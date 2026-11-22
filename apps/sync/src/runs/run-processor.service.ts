import { Injectable } from '@nestjs/common';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import type { ClaimedSyncRun, SyncRunCounts } from './run.types';
import { RunsService } from './runs.service';
import { maintainRunLease, RunLeaseLostError } from './run-lease';

@Injectable()
export class RunProcessorService {
  constructor(
    private readonly runs: RunsService,
    private readonly connectors: ConnectorRegistryService,
  ) {}

  async process(run: ClaimedSyncRun): Promise<void> {
    const renewed = await this.runs.renewLease(
      run.tenant_id,
      run.id,
      run.claim_token,
    );

    if (!renewed) {
      throw new RunLeaseLostError();
    }

    let counts: SyncRunCounts = {
      read: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      retired: 0,
      ignored: 0,
    };

    const stopRenewal = new AbortController();
    const stopImport = new AbortController();

    let leaseFailure: { error: unknown } | undefined;
    let importFailure: { error: unknown } | undefined;

    const renewal = maintainRunLease(run, this.runs, stopRenewal.signal).catch(
      (error: unknown) => {
        leaseFailure = { error };
        stopImport.abort(error);
      },
    );

    try {
      const importer = this.connectors.get(
        run.connector,
        run.source_collection,
      );
      counts = await importer.run(
        run.tenant_id,
        run.source_connection_id,
        (progress) => {
          counts = { ...progress };
        },
        stopImport.signal,
        {
          run_id: run.id,
          claim_token: run.claim_token,
        },
      );
    } catch (error: unknown) {
      importFailure = { error };
    } finally {
      stopRenewal.abort();
      await renewal;
    }

    if (leaseFailure) {
      throw leaseFailure.error;
    }

    if (importFailure) {
      await this.runs.fail(
        run.tenant_id,
        run.id,
        counts,
        importFailure.error,
        run.claim_token,
      );
      return;
    }

    await this.runs.complete(run.tenant_id, run.id, counts, run.claim_token);
  }
}
