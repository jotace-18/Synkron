export interface RuleNotificationSource {
  kind: 'rule';
  rule_id: string;
  event_id: string;
  sync_run_id: string;
  activity_id?: string;
}

export interface NotificationRequest {
  tenant_id: string;
  source_action_id: string;
  message: string;
  source: RuleNotificationSource;
}
