import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SyncRunMessage } from './sync-run-message';

@Injectable()
export class RunJobsService {
  constructor(private readonly database: DatabaseService) {}

  async publishNext(
    publish: (message: SyncRunMessage) => Promise<void>,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const result = await client.query<{
        run_id: string;
        tenant_id: string;
      }>(
        `SELECT run_id, tenant_id
         FROM sync.run_jobs
         WHERE published_at IS NULL
         ORDER BY created_at, run_id
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );

      const job = result.rows[0];

      if (!job) {
        return false;
      }

      await publish({
        schema_version: 1,
        run_id: job.run_id,
        tenant_id: job.tenant_id,
      });

      await client.query(
        `UPDATE sync.run_jobs
         SET published_at = clock_timestamp()
         WHERE tenant_id = $1
           AND run_id = $2
           AND published_at IS NULL`,
        [job.tenant_id, job.run_id],
      );

      return true;
    });
  }
}
