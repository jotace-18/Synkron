import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SyncEvent } from '../events/sync-event.types';

type StoredEvent<T extends SyncEvent = SyncEvent> = T extends SyncEvent
  ? Omit<T, 'occurred_at' | 'automation_action_id'> & {
      occurred_at: Date;
      automation_action_id: string | null;
    }
  : never;

@Injectable()
export class EventOutboxService {
  constructor(private readonly database: DatabaseService) {}

  async publishNext(
    publish: (event: SyncEvent) => Promise<void>,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const result = await client.query<StoredEvent>(
        `SELECT event_id, tenant_id, event_type, schema_version,
                correlation_id, causation_id, occurred_at,
                producer, payload, automation_action_id
         FROM sync.event_outbox
         WHERE published_at IS NULL
         ORDER BY occurred_at, event_id
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );

      const stored = result.rows[0];

      if (!stored) {
        return false;
      }

      const { automation_action_id: origin, ...event } = stored;

      await publish({
        ...event,
        ...(origin ? { automation_action_id: origin } : {}),
        occurred_at: stored.occurred_at.toISOString(),
      });

      await client.query(
        `UPDATE sync.event_outbox
         SET published_at = clock_timestamp()
         WHERE tenant_id = $1
           AND event_id = $2
           AND published_at IS NULL`,
        [stored.tenant_id, stored.event_id],
      );

      return true;
    });
  }
}
