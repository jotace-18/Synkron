import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  ReminderSettingsInput,
  ReminderSettingsView,
  StoredReminderSettings,
} from './reminder.types';

@Injectable()
export class ReminderSettingsService {
  constructor(private readonly database: DatabaseService) {}

  async get(tenantId: string): Promise<ReminderSettingsView | null> {
    const result = await this.database.query<StoredReminderSettings>(
      `SELECT id, tenant_id, enabled, lead_minutes,
              created_at, updated_at
       FROM automation.reminder_settings
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const settings = result.rows[0];

    return settings ? this.toView(settings) : null;
  }

  async update(
    tenantId: string,
    input: ReminderSettingsInput,
  ): Promise<ReminderSettingsView> {
    const result = await this.database.query<StoredReminderSettings>(
      `INSERT INTO automation.reminder_settings (
         tenant_id, enabled, lead_minutes
       )
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id) DO UPDATE
       SET enabled = EXCLUDED.enabled,
           lead_minutes = EXCLUDED.lead_minutes,
           updated_at = CASE
             WHEN (
               automation.reminder_settings.enabled,
               automation.reminder_settings.lead_minutes
             ) IS DISTINCT FROM (
               EXCLUDED.enabled,
               EXCLUDED.lead_minutes
             )
             THEN clock_timestamp()
             ELSE automation.reminder_settings.updated_at
           END
       RETURNING id, tenant_id, enabled, lead_minutes,
                 created_at, updated_at`,
      [tenantId, input.enabled, input.lead_minutes],
    );

    return this.toView(result.rows[0]);
  }

  private toView(settings: StoredReminderSettings): ReminderSettingsView {
    return {
      id: settings.id,
      enabled: settings.enabled,
      lead_minutes: settings.lead_minutes,
      created_at: settings.created_at.toISOString(),
      updated_at: settings.updated_at.toISOString(),
    };
  }
}
