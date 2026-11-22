import { randomUUID } from 'node:crypto';
import type { DataChangedEvent, DataChangedPayload } from './sync-event.types';

export function createDataChangedEvent(
  tenantId: string,
  payload: DataChangedPayload,
  automationActionId?: string,
): DataChangedEvent {
  return {
    event_id: randomUUID(),
    event_type: 'data.changed',
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
