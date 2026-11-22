import type { PoolClient } from 'pg';
import type { SyncEvent } from './sync-event.types';

export async function appendOutboxEvent(
  client: PoolClient,
  event: SyncEvent,
): Promise<void> {
  await client.query(
    `INSERT INTO sync.event_outbox (
       event_id, tenant_id, event_type, schema_version,
       correlation_id, causation_id, occurred_at, producer, payload,
       automation_action_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9::jsonb, $10
     )`,
    [
      event.event_id,
      event.tenant_id,
      event.event_type,
      event.schema_version,
      event.correlation_id,
      event.causation_id,
      event.occurred_at,
      event.producer,
      JSON.stringify(event.payload),
      event.automation_action_id ?? null,
    ],
  );
}
