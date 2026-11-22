export interface RuleNotificationSource {
  kind: 'rule';
  rule_id: string;
  event_id: string;
  sync_run_id: string;
  activity_id?: string;
}

export interface ReminderNotificationSource {
  kind: 'reminder';
  reminder_id: string;
  activity_id: string;
  deadline_key: string;
}

export type NotificationSource =
  RuleNotificationSource | ReminderNotificationSource;

export interface CreateNotificationInput {
  tenant_id: string;
  source_action_id: string;
  message: string;
  source: NotificationSource;
}

export interface StoredNotification extends CreateNotificationInput {
  id: string;
  created_at: Date;
  read_at: Date | null;
}

export interface NotificationView {
  id: string;
  message: string;
  source: NotificationSource;
  created_at: string;
  read_at: string | null;
}
