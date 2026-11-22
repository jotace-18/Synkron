import type { ActivityInput } from '../activities/activity.types';
import type { SyncRunCounts, SyncRunStatus } from '../runs/run.types';
import type { SafeSyncRunError } from '../runs/sync-run-error';

export type IngestionActivity = Pick<
  ActivityInput,
  'type' | 'title' | 'schedule' | 'status' | 'details'
>;

interface IngestionBase {
  schema_version: 1;
  external_id: string;
  source_updated_at: string | null;
}

export interface IngestionUpsert extends IngestionBase {
  action: 'upsert';
  activity: IngestionActivity;
}

export interface IngestionRetirement extends IngestionBase {
  action: 'retire';
  source_deleted_at: string;
}

export type IngestionRequest = IngestionUpsert | IngestionRetirement;

export interface IngestionReceipt {
  id: string;
  status: SyncRunStatus;
}

export interface IngestionResult extends IngestionReceipt {
  counts: SyncRunCounts;
  error: SafeSyncRunError | null;
}
