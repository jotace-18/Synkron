import type { RunConnectorName } from '../connectors/connector-catalog';
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

export interface ClaimedSyncRun extends SyncRun {
  status: 'running';
  tenant_id: string;
  source_connection_id: string;
  connector: RunConnectorName;
  source_collection: string;
  claim_token: string;
  lease_expires_at: Date;
}

export interface SyncRunCounts {
  read: number;
  created: number;
  updated: number;
  unchanged: number;
  retired: number;
  ignored: number;
}

export interface SyncRunDeliveryState {
  status: SyncRunStatus;
  source_supported: boolean;
  lease_expires_at: Date | null;
}
