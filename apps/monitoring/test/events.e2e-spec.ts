import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service';
import { EventsService } from '../src/events/events.service';
import type { SyncCompletedEvent } from '../src/events/sync-event.types';

describe('Monitoring event storage (PostgreSQL)', () => {
  const database = new DatabaseService();
  const events = new EventsService(database);
  const tenantId = randomUUID();

  beforeAll(async () => {
    await database.checkConnection();
  });

  afterAll(async () => {
    try {
      await database.query(
        'DELETE FROM monitoring.events WHERE tenant_id = $1',
        [tenantId],
      );
    } finally {
      await database.onModuleDestroy();
    }
  });

  it('stores concurrent deliveries once and preserves the original event', async () => {
    const runId = randomUUID();

    const event: SyncCompletedEvent = {
      event_id: randomUUID(),
      tenant_id: tenantId,
      event_type: 'sync.completed',
      schema_version: 1,
      correlation_id: runId,
      causation_id: runId,
      occurred_at: '2026-11-19T10:00:00.000Z',
      producer: 'sync',
      payload: {
        sync_run_id: runId,
        definition_id: randomUUID(),
        counts: {
          read: 1,
          created: 1,
          updated: 0,
          unchanged: 0,
          retired: 0,
          ignored: 0,
        },
      },
    };

    const results = await Promise.all(
      Array.from({ length: 4 }, () => events.store(event)),
    );

    expect(results.filter((result) => result === 'stored')).toHaveLength(1);
    expect(results.filter((result) => result === 'duplicate')).toHaveLength(3);

    await expect(
      events.store({
        ...event,
        payload: {
          ...event.payload,
          definition_id: randomUUID(),
        },
      }),
    ).resolves.toBe('duplicate');

    const stored = await database.query<{
      event_id: string;
      tenant_id: string;
      payload: SyncCompletedEvent['payload'];
      occurred_at: Date;
      received_at: Date;
    }>(
      `SELECT event_id, tenant_id, payload, occurred_at, received_at
       FROM monitoring.events
       WHERE tenant_id = $1`,
      [tenantId],
    );

    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      event_id: event.event_id,
      tenant_id: tenantId,
      payload: event.payload,
    });
    expect(stored.rows[0].occurred_at.toISOString()).toBe(event.occurred_at);
    expect(stored.rows[0].received_at).toBeInstanceOf(Date);
  });
});
