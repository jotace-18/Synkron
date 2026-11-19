import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SyncEvent } from './sync-event.types';

export type StoreEventResult = 'stored' | 'duplicate';

@Injectable()
export class EventsService {
  constructor(private readonly database: DatabaseService) {}

  async store(event: SyncEvent): Promise<StoreEventResult> {
    const result = await this.database.query(
      `INSERT INTO monitoring.events (
         event_id,
         tenant_id,
         event_type,
         schema_version,
         correlation_id,
         causation_id,
         occurred_at,
         producer,
         payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
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
      ],
    );

    return result.rowCount === 1 ? 'stored' : 'duplicate';
  }
}
