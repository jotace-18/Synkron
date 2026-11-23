import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import {
  MonitoringClientService,
  NotificationRequestError,
} from '../monitoring-client/monitoring-client.service';
import { ReminderActivitiesClientService } from '../sync-client/reminder-activities-client.service';
import type { ReminderActivity } from '../sync-client/reminder-activity.types';
import { isReminderCandidate, madridDate } from './due-reminder';

interface PendingReminder {
  id: string;
  tenant_id: string;
  activity_id: string;
  deadline_key: string;
  message: string;
  enabled: boolean;
}

@Injectable()
export class ReminderDispatcherService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activities: ReminderActivitiesClientService,
    private readonly monitoring: MonitoringClientService,
  ) {}

  async dispatchOne(now: Date = new Date()): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const pending = await client.query<PendingReminder>(
        `SELECT
           r.id, r.tenant_id, r.activity_id,
           r.deadline_key, r.message, s.enabled
         FROM automation.reminder_requests r
         JOIN automation.reminder_settings s
           ON s.id = r.settings_id
          AND s.tenant_id = r.tenant_id
         WHERE r.status = 'pending'
           AND r.next_attempt_at <= $1
         ORDER BY r.next_attempt_at, r.id
         LIMIT 1
         FOR UPDATE OF r SKIP LOCKED
         FOR SHARE OF s SKIP LOCKED`,
        [now],
      );

      const reminder = pending.rows[0];

      if (!reminder) {
        return false;
      }

      if (!reminder.enabled) {
        return this.cancel(
          client,
          reminder,
          'reminders_disabled',
          'Los recordatorios están desactivados.',
        );
      }

      let notificationId: string;

      try {
        const activity = await this.activities.get(
          reminder.tenant_id,
          reminder.activity_id,
        );

        if (
          !activity ||
          !this.stillApplies(activity, reminder.deadline_key, new Date())
        ) {
          return await this.cancel(
            client,
            reminder,
            'reminder_obsolete',
            'La actividad ya no cumple las condiciones del recordatorio.',
          );
        }

        notificationId = await this.monitoring.createNotification({
          tenant_id: reminder.tenant_id,
          source_action_id: reminder.id,
          message: reminder.message,
          source: {
            kind: 'reminder',
            reminder_id: reminder.id,
            activity_id: reminder.activity_id,
            deadline_key: reminder.deadline_key,
          },
        });
      } catch (error) {
        if (
          !(error instanceof NotificationRequestError) &&
          !(error instanceof ServiceUnavailableException)
        ) {
          throw error;
        }

        const retryable =
          error instanceof NotificationRequestError ? error.retryable : true;

        const code =
          error instanceof NotificationRequestError
            ? error.code
            : 'sync_unavailable';

        const message =
          error instanceof NotificationRequestError
            ? error.message
            : 'No se pudo comprobar el estado actual de la actividad.';

        await client.query(
          `UPDATE automation.reminder_requests
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
            reminder.id,
            reminder.tenant_id,
            retryable ? 'pending' : 'failed',
            retryable ? new Date(Date.now() + 30_000) : null,
            code,
            message,
          ],
        );

        return true;
      }

      await client.query(
        `UPDATE automation.reminder_requests
         SET status = 'accepted',
             result_id = $3,
             attempt_count = attempt_count + 1,
             next_attempt_at = NULL,
             error_code = NULL,
             error_message = NULL,
             resolved_at = clock_timestamp()
         WHERE id = $1 AND tenant_id = $2`,
        [reminder.id, reminder.tenant_id, notificationId],
      );

      return true;
    });
  }

  private stillApplies(
    activity: ReminderActivity,
    deadlineKey: string,
    now: Date,
  ): boolean {
    if (!isReminderCandidate(activity)) return false;
    const schedule = activity.schedule;

    if (schedule.kind === 'date') {
      return (
        deadlineKey === `date:${schedule.date}` &&
        madridDate(now) <= schedule.date
      );
    }

    if (schedule.kind === 'instant') {
      const deadline = new Date(schedule.at);

      return (
        deadlineKey === `instant:${deadline.toISOString()}` &&
        deadline.getTime() > now.getTime()
      );
    }

    return false;
  }

  private async cancel(
    client: PoolClient,
    reminder: PendingReminder,
    code: string,
    message: string,
  ): Promise<boolean> {
    await client.query(
      `UPDATE automation.reminder_requests
       SET status = 'cancelled',
           next_attempt_at = NULL,
           error_code = $3,
           error_message = $4,
           resolved_at = clock_timestamp()
       WHERE id = $1 AND tenant_id = $2`,
      [reminder.id, reminder.tenant_id, code, message],
    );

    return true;
  }
}
