import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  REMINDER_ACTIVITIES_PAGE_SIZE,
  ReminderActivitiesClientService,
} from '../sync-client/reminder-activities-client.service';
import type { ReminderActivity } from '../sync-client/reminder-activity.types';
import { dueReminder, madridDate } from './due-reminder';
import type { StoredReminderSettings } from './reminder.types';

interface ReminderAccount {
  id: string;
  tenant_id: string;
}

@Injectable()
export class ReminderPlannerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activities: ReminderActivitiesClientService,
  ) {}

  async prepareDue(now: Date = new Date()): Promise<number> {
    const from = madridDate(now);
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 3);
    const to = end.toISOString().slice(0, 10);

    const accounts = await this.database.query<ReminderAccount>(
      `SELECT id, tenant_id
       FROM automation.reminder_settings
       WHERE enabled
       ORDER BY id`,
    );

    let created = 0;

    for (const account of accounts.rows) {
      let offset = 0;

      while (true) {
        const page = await this.activities.list(account.tenant_id, {
          from,
          to,
          offset,
        });

        created += await this.preparePage(account, page, now);

        if (page.length < REMINDER_ACTIVITIES_PAGE_SIZE) {
          break;
        }

        offset += REMINDER_ACTIVITIES_PAGE_SIZE;
      }
    }

    return created;
  }

  private async preparePage(
    account: ReminderAccount,
    activities: ReminderActivity[],
    now: Date,
  ): Promise<number> {
    return this.database.transaction(async (client) => {
      const result = await client.query<StoredReminderSettings>(
        `SELECT id, tenant_id, enabled, lead_minutes,
                created_at, updated_at
         FROM automation.reminder_settings
         WHERE id = $1 AND tenant_id = $2
         FOR SHARE`,
        [account.id, account.tenant_id],
      );

      const settings = result.rows[0];

      if (!settings?.enabled) {
        return 0;
      }

      let created = 0;

      for (const activity of activities) {
        const reminder = dueReminder(activity, settings, now);

        if (!reminder) {
          continue;
        }

        const inserted = await client.query(
          `INSERT INTO automation.reminder_requests (
             tenant_id, settings_id, activity_id,
             deadline_key, notify_at, message
           )
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (
             tenant_id, activity_id, deadline_key
           ) DO NOTHING`,
          [
            settings.tenant_id,
            settings.id,
            activity.id,
            reminder.deadline_key,
            reminder.notify_at,
            `Recordatorio: ${activity.title}`.slice(0, 500),
          ],
        );

        created += inserted.rowCount ?? 0;
      }

      return created;
    });
  }
}
