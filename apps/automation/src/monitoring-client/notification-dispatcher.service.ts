import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SyncEvent } from '../events/sync-event.types';
import {
  MonitoringClientService,
  NotificationRequestError,
} from './monitoring-client.service';

interface PendingNotification {
  id: string;
  tenant_id: string;
  action: {
    type: 'notify';
    message: string;
  };
  rule_id: string;
  event_id: string;
  payload: SyncEvent['payload'];
}

@Injectable()
export class NotificationDispatcherService {
  constructor(
    private readonly database: DatabaseService,
    private readonly monitoring: MonitoringClientService,
  ) {}

  async dispatchOne(now: Date = new Date()): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const pending = await client.query<PendingNotification>(
        `SELECT
           a.id, a.tenant_id, a.action,
           e.rule_id, e.event_id, v.payload
         FROM automation.rule_actions a
         JOIN automation.rule_evaluations e
           ON e.id = a.evaluation_id
          AND e.tenant_id = a.tenant_id
         JOIN automation.rule_events v
           ON v.event_id = e.event_id
          AND v.tenant_id = e.tenant_id
         WHERE a.status = 'pending'
           AND a.action_type = 'notify'
           AND a.next_attempt_at <= $1
         ORDER BY a.next_attempt_at, a.id
         LIMIT 1
         FOR UPDATE OF a SKIP LOCKED`,
        [now],
      );

      const notification = pending.rows[0];

      if (!notification) {
        return false;
      }

      let notificationId: string;

      try {
        notificationId = await this.monitoring.createNotification({
          tenant_id: notification.tenant_id,
          source_action_id: notification.id,
          message: notification.action.message,
          source: {
            kind: 'rule',
            rule_id: notification.rule_id,
            event_id: notification.event_id,
            sync_run_id: notification.payload.sync_run_id,
            ...('activity_id' in notification.payload
              ? { activity_id: notification.payload.activity_id }
              : {}),
          },
        });
      } catch (error) {
        if (!(error instanceof NotificationRequestError)) {
          throw error;
        }

        await client.query(
          `UPDATE automation.rule_actions
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
            notification.id,
            notification.tenant_id,
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
         SET status = 'accepted',
             result_id = $3,
             attempt_count = attempt_count + 1,
             next_attempt_at = NULL,
             error_code = NULL,
             error_message = NULL,
             resolved_at = clock_timestamp()
         WHERE id = $1 AND tenant_id = $2`,
        [notification.id, notification.tenant_id, notificationId],
      );

      return true;
    });
  }
}
