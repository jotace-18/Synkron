import type {
  DataChangedPayload,
  SyncRunCounts,
} from '../events/sync-event.types';

export type MonitoringRunStatus = 'completed' | 'failed';

export interface MonitoringRunView {
  id: string;
  definition_id: string;
  status: MonitoringRunStatus;
  occurred_at: string;
  received_at: string;
  counts: SyncRunCounts;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface MonitoringSummaryView {
  from: string;
  to: string;
  completed_runs: number;
  failed_runs: number;
  changes: {
    created: number;
    updated: number;
    retired: number;
  };
  last_run: MonitoringRunView | null;
}

export interface MonitoringChangeView extends DataChangedPayload {
  event_id: string;
  occurred_at: string;
  received_at: string;
}

export interface MonitoringRunDetailView {
  run: MonitoringRunView;
  changes: MonitoringChangeView[];
  next_changes_offset: number | null;
}
