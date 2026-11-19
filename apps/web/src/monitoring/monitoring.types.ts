export type MonitoringRunStatus = 'completed' | 'failed'

export interface MonitoringCounts {
  read: number
  created: number
  updated: number
  unchanged: number
  retired: number
  ignored: number
}

export interface MonitoringRun {
  id: string
  definition_id: string
  status: MonitoringRunStatus
  occurred_at: string
  received_at: string
  counts: MonitoringCounts
  error: {
    code: string
    message: string
  } | null
}

export interface MonitoringSummary {
  from: string
  to: string
  completed_runs: number
  failed_runs: number
  changes: {
    created: number
    updated: number
    retired: number
  }
  last_run: MonitoringRun | null
}

export interface MonitoringChange {
  event_id: string
  occurred_at: string
  received_at: string
  sync_run_id: string
  activity_id: string
  source_connection_id: string
  source_collection: string
  activity_type: string
  external_id: string
  change_type: 'created' | 'updated' | 'retired'
  changed_fields: string[]
}

export interface MonitoringRunDetail {
  run: MonitoringRun
  changes: MonitoringChange[]
  next_changes_offset: number | null
}