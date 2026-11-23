import { Injectable } from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service';
import type { ActivityRunLease } from '../activities/activity.types';
import { normalizeActivityImport } from './activity-import.validation';
import type { ActivityImportContext } from './activity-import.validation';
import { emptyImportResult } from './import-result';
import type { ImportResult } from './import.types';

@Injectable()
export class ActivityImportPipeline {
  constructor(private readonly activities: ActivitiesService) {}

  async run(
    context: ActivityImportContext,
    instructions: readonly unknown[],
    onProgress?: (summary: ImportResult) => void,
    signal?: AbortSignal,
    lease?: ActivityRunLease,
  ): Promise<ImportResult> {
    signal?.throwIfAborted();
    const authorized = {
      ...context,
      allowed_types: [...context.allowed_types],
    };
    const summary = emptyImportResult(
      authorized.source_connection_id,
      instructions.length,
    );

    // Snapshot and validate the whole input before progress callbacks or writes.
    const imports = (() => {
      try {
        return instructions.map((value) =>
          normalizeActivityImport(value, authorized),
        );
      } catch (error) {
        onProgress?.({ ...summary });
        throw error;
      }
    })();
    onProgress?.({ ...summary });

    for (const instruction of imports) {
      signal?.throwIfAborted();
      if (instruction.action === 'upsert') {
        const saved = await this.activities.save(
          authorized.tenant_id,
          instruction.activity,
          lease,
        );
        summary[saved.outcome] += 1;
      } else {
        const retired = await this.activities.retire(
          authorized.tenant_id,
          instruction,
          lease,
        );
        if (retired.outcome === 'not_found') summary.ignored += 1;
        else summary[retired.outcome] += 1;
      }
      onProgress?.({ ...summary });
    }
    signal?.throwIfAborted();
    return summary;
  }
}
