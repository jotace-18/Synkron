import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  SyncClientService,
  SyncRequestError,
} from '../sync-client/sync-client.service';

interface PendingAction {
  id: string;
  tenant_id: string;
  action: { type: 'start_sync'; definition_id: string };
  automation_action_id: string | null;
}

@Injectable()
export class RuleSyncDispatcherService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sync: SyncClientService,
  ) {}

  async dispatchOne(now = new Date()): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const pending = await client.query<PendingAction>(
        `SELECT a.id, a.tenant_id, a.action, v.automation_action_id
         FROM automation.rule_actions a
         JOIN automation.rule_evaluations e
           ON e.id = a.evaluation_id AND e.tenant_id = a.tenant_id
         JOIN automation.rule_events v
           ON v.event_id = e.event_id AND v.tenant_id = e.tenant_id
         WHERE a.status = 'pending' AND a.action_type = 'start_sync'
           AND a.next_attempt_at <= $1
         ORDER BY a.next_attempt_at, a.id
         LIMIT 1 FOR UPDATE OF a SKIP LOCKED`,
        [now],
      );
      const action = pending.rows[0];
      if (!action) return false;

      // También protege las acciones antiguas que se hubieran quedado pendientes.
      if (action.automation_action_id !== null) {
        await client.query(
          `UPDATE automation.rule_actions
           SET status = 'blocked', next_attempt_at = NULL,
               error_code = 'chain_limit',
               error_message = 'La sincronización ya fue iniciada por una regla.',
               resolved_at = clock_timestamp()
           WHERE id = $1 AND tenant_id = $2`,
          [action.id, action.tenant_id],
        );
        return true;
      }

      let runId: string;
      try {
        runId = await this.sync.requestRun(
          action.tenant_id,
          action.action.definition_id,
          action.id,
          action.id,
        );
      } catch (error) {
        if (!(error instanceof SyncRequestError)) throw error;
        await client.query(
          `UPDATE automation.rule_actions
           SET status = $3::text, attempt_count = attempt_count + 1,
               next_attempt_at = $4, error_code = $5, error_message = $6,
               resolved_at = CASE WHEN $3::text = 'failed'
                 THEN clock_timestamp() ELSE NULL END
           WHERE id = $1 AND tenant_id = $2`,
          [
            action.id,
            action.tenant_id,
            error.retryable ? 'pending' : 'failed',
            error.retryable ? new Date(Date.now() + 30_000) : null,
            error.code,
            error.message,
          ],
        );
        return true;
      }

      await client.query(
        `UPDATE automation.rule_actions
         SET status = 'accepted', result_id = $3,
             attempt_count = attempt_count + 1, next_attempt_at = NULL,
             error_code = NULL, error_message = NULL,
             resolved_at = clock_timestamp()
         WHERE id = $1 AND tenant_id = $2`,
        [action.id, action.tenant_id, runId],
      );
      return true;
    });
  }
}
