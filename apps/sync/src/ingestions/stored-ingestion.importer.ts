import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ActivityImportPipeline } from '../imports/activity-import.pipeline';
import type {
  ActivityType,
  ActivityRunLease,
} from '../activities/activity.types';
import type { ImportResult } from '../imports/import.types';
import { RunLeaseLostError } from '../runs/run-lease';
@Injectable()
export class StoredIngestionImporter {
  constructor(
    private readonly database: DatabaseService,
    private readonly pipeline: ActivityImportPipeline,
  ) {}
  async run(
    tenantId: string,
    connectionId: string,
    onProgress?: (summary: ImportResult) => void,
    signal?: AbortSignal,
    lease?: ActivityRunLease,
  ): Promise<ImportResult> {
    signal?.throwIfAborted();
    if (!lease) throw new RunLeaseLostError();
    const result = await this.database.query<{
      operation: unknown;
      allowed_types: ActivityType[];
      source_collection: string;
    }>(
      `SELECT i.operation,i.allowed_types,r.source_collection FROM sync.ingestions i
   JOIN sync.runs r ON r.tenant_id=i.tenant_id AND r.id=i.run_id
   WHERE r.tenant_id=$1 AND r.id=$2 AND r.source_connection_id=$3 AND r.connector='standard.ingestion'
    AND r.status='running' AND r.claim_token=$4 AND r.lease_expires_at>clock_timestamp()`,
      [tenantId, lease.run_id, connectionId, lease.claim_token],
    );
    const stored = result.rows[0];
    if (!stored) throw new RunLeaseLostError();
    return this.pipeline.run(
      {
        tenant_id: tenantId,
        source_connection_id: connectionId,
        source_collection: stored.source_collection,
        allowed_types: stored.allowed_types,
      },
      [stored.operation],
      onProgress,
      signal,
      lease,
    );
  }
}
