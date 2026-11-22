import { randomUUID } from 'node:crypto';
import type {
  SyncCompletedEvent,
  SyncFailedEvent,
  SyncFailedPayload,
  SyncResultPayload,
} from './sync-event.types';

export function createSyncCompletedEvent(
  tenantId: string,
  payload: SyncResultPayload,
  automationActionId?: string,
): SyncCompletedEvent {
  return {
    event_id: randomUUID(),
    event_type: 'sync.completed',
    schema_version: 1,
    tenant_id: tenantId,
    correlation_id: payload.sync_run_id,
    causation_id: payload.sync_run_id,
    occurred_at: new Date().toISOString(),
    producer: 'sync',
    ...(automationActionId ? { automation_action_id: automationActionId } : {}),
    payload,
  };
}

export function createSyncFailedEvent(
  tenantId: string,
  payload: SyncFailedPayload,
  automationActionId?: string,
): SyncFailedEvent {
  return {
    event_id: randomUUID(),
    event_type: 'sync.failed',
    schema_version: 1,
    tenant_id: tenantId,
    correlation_id: payload.sync_run_id,
    causation_id: payload.sync_run_id,
    occurred_at: new Date().toISOString(),
    producer: 'sync',
    ...(automationActionId ? { automation_action_id: automationActionId } : {}),
    payload,
  };
}
