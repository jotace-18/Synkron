import type { ActivityType } from '../activities/activity.types';
import type { SyncRunCounts } from '../runs/run.types';
import type { SafeSyncRunError } from '../runs/sync-run-error';

export type SyncEventType = 'data.changed' | 'sync.completed' | 'sync.failed';

export interface SyncEventEnvelope<TType extends SyncEventType, TPayload> {
  event_id: string;
  event_type: TType;
  schema_version: 1;
  tenant_id: string;
  correlation_id: string;
  causation_id: string;
  occurred_at: string;
  producer: 'sync';
  payload: TPayload;
}

export interface DataChangedPayload {
  sync_run_id: string;
  activity_id: string;
  source_connection_id: string;
  source_collection: string;
  activity_type: ActivityType;
  external_id: string;
  change_type: 'created' | 'updated' | 'retired';
  changed_fields: string[];
}

export type DataChangedEvent = SyncEventEnvelope<
  'data.changed',
  DataChangedPayload
>;

export interface SyncResultPayload {
  sync_run_id: string;
  definition_id: string;
  counts: SyncRunCounts;
}

export interface SyncFailedPayload extends SyncResultPayload {
  error: SafeSyncRunError;
}

export type SyncCompletedEvent = SyncEventEnvelope<
  'sync.completed',
  SyncResultPayload
>;

export type SyncFailedEvent = SyncEventEnvelope<
  'sync.failed',
  SyncFailedPayload
>;

export type SyncEvent = DataChangedEvent | SyncCompletedEvent | SyncFailedEvent;
