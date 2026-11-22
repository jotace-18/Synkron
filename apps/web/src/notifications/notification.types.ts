export type NotificationSource =
  | {
      kind: 'rule'
      rule_id: string
      event_id: string
      sync_run_id: string
      activity_id?: string
    }
  | {
      kind: 'reminder'
      reminder_id: string
      activity_id: string
      deadline_key: string
    }

export interface UserNotification {
  id: string
  message: string
  source: NotificationSource
  created_at: string
  read_at: string | null
}

export type NotificationFilter = 'all' | 'unread' | 'read'
