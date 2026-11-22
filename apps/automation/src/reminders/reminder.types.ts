export const REMINDER_LEAD_MINUTES = [60, 1440] as const;

export type ReminderLeadMinutes = (typeof REMINDER_LEAD_MINUTES)[number];

export interface ReminderSettingsInput {
  enabled: boolean;
  lead_minutes: ReminderLeadMinutes;
}

export interface StoredReminderSettings extends ReminderSettingsInput {
  id: string;
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface ReminderSettingsView extends ReminderSettingsInput {
  id: string;
  created_at: string;
  updated_at: string;
}
