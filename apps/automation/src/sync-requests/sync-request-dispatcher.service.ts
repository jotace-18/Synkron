import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  SyncClientService,
  SyncRequestError,
} from '../sync-client/sync-client.service';

interface PendingRequest {
  id: string;
  tenant_id: string;
  definition_id: string;
}

export type DispatchResult =
  | { status: 'idle' }
  | {
      status: 'accepted';
      request_id: string;
      sync_run_id: string;
    }
  | {
      status: 'retry' | 'failed';
      request_id: string;
    };

@Injectable()
export class SyncRequestDispatcherService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sync: SyncClientService,
  ) {}

  async dispatchOne(now: Date = new Date()): Promise<DispatchResult> {
    return this.database.transaction(async (client) => {
      const pending = await client.query<PendingRequest>(
        `SELECT id, tenant_id, definition_id
         FROM automation.sync_requests
         WHERE status = 'pending'
           AND next_attempt_at <= $1
         ORDER BY next_attempt_at, id
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [now],
      );

      const request = pending.rows[0];

      if (!request) {
        return { status: 'idle' };
      }

      let runId: string;

      try {
        runId = await this.sync.requestRun(
          request.tenant_id,
          request.definition_id,
          request.id,
        );
      } catch (error) {
        if (!(error instanceof SyncRequestError)) {
          throw error;
        }

        const status = error.retryable ? 'pending' : 'failed';
        const nextAttempt = error.retryable
          ? new Date(now.getTime() + 30_000)
          : null;

        await client.query(
          `UPDATE automation.sync_requests
           SET status = $3::text,
               attempt_count = attempt_count + 1,
               next_attempt_at = $4,
               error_code = $5,
               error_message = $6,
               resolved_at = CASE
                 WHEN $3::text = 'failed' THEN clock_timestamp()
                 ELSE NULL
               END
           WHERE id = $1 AND tenant_id = $2`,
          [
            request.id,
            request.tenant_id,
            status,
            nextAttempt,
            error.code,
            error.message,
          ],
        );

        return {
          status: error.retryable ? 'retry' : 'failed',
          request_id: request.id,
        };
      }

      await client.query(
        `UPDATE automation.sync_requests
         SET status = 'accepted',
             sync_run_id = $3,
             attempt_count = attempt_count + 1,
             next_attempt_at = NULL,
             error_code = NULL,
             error_message = NULL,
             resolved_at = clock_timestamp()
         WHERE id = $1 AND tenant_id = $2`,
        [request.id, request.tenant_id, runId],
      );

      return {
        status: 'accepted',
        request_id: request.id,
        sync_run_id: runId,
      };
    });
  }
}
