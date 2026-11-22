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

export interface NotificationRequest {
  tenant_id: string;
  source_action_id: string;
  message: string;
  source: NotificationSource;
}
