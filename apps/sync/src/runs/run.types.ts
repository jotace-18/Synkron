import type { SyncRunErrorCode } from './sync-run-error';

export type SyncRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface SyncRun {
  id: string;
  definition_id: string;
  status: SyncRunStatus;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  read_count: number;
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  retired_count: number;
  ignored_count: number;
  error_code: SyncRunErrorCode | null;
  error_message: string | null;
}
