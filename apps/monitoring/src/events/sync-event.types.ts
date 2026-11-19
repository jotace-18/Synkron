export interface SyncRunCounts {
  read: number;
  created: number;
  updated: number;
  unchanged: number;
  retired: number;
  ignored: number;
}

export interface SyncEventEnvelope<TType extends string, TPayload> {
  event_id: string;
  tenant_id: string;
  event_type: TType;
  schema_version: 1;
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
  activity_type: string;
  external_id: string;
  change_type: 'created' | 'updated' | 'retired';
  changed_fields: string[];
}

export interface SyncResultPayload {
  sync_run_id: string;
  definition_id: string;
  counts: SyncRunCounts;
}

export interface SyncFailedPayload extends SyncResultPayload {
  error: {
    code: string;
    message: string;
  };
}

export type DataChangedEvent = SyncEventEnvelope<
  'data.changed',
  DataChangedPayload
>;

export type SyncCompletedEvent = SyncEventEnvelope<
  'sync.completed',
  SyncResultPayload
>;

export type SyncFailedEvent = SyncEventEnvelope<
  'sync.failed',
  SyncFailedPayload
>;

export type SyncEvent = DataChangedEvent | SyncCompletedEvent | SyncFailedEvent;
