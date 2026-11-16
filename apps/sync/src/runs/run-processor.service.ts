import { Injectable } from '@nestjs/common';
import { AcademicImportService } from '../imports/academic-import.service';
import type { ClaimedSyncRun, SyncRunCounts } from './run.types';
import { RunsService } from './runs.service';

@Injectable()
export class RunProcessorService {
  constructor(
    private readonly runs: RunsService,
    private readonly academic: AcademicImportService,
  ) {}

  async process(run: ClaimedSyncRun): Promise<void> {
    let counts: SyncRunCounts = {
      read: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      retired: 0,
      ignored: 0,
    };

    try {
      counts = await this.academic.run(
        run.tenant_id,
        run.source_connection_id,
        (progress) => {
          counts = { ...progress };
        },
      );
    } catch (error: unknown) {
      await this.runs.fail(run.tenant_id, run.id, counts, error);
      return;
    }

    await this.runs.complete(run.tenant_id, run.id, counts);
  }
}
