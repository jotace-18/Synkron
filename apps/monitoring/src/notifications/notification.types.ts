export interface RuleNotificationSource {
  kind: 'rule';
  rule_id: string;
  event_id: string;
  sync_run_id: string;
  activity_id?: string;
}

export interface CreateNotificationInput {
  tenant_id: string;
  source_action_id: string;
  message: string;
  source: RuleNotificationSource;
}

export interface StoredNotification extends CreateNotificationInput {
  id: string;
  created_at: Date;
  read_at: Date | null;
}

export interface NotificationView {
  id: string;
  message: string;
  source: RuleNotificationSource;
  created_at: string;
  read_at: string | null;
}
