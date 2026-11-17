import type { Channel } from 'amqplib';
import { SYNC_EVENT_EXCHANGE } from './sync-event-exchange';

export const SYNC_EVENT_INSPECTION_QUEUE = 'synkron.events.inspection.v1';

export async function declareSyncEventInspectionQueue(
  channel: Channel,
): Promise<void> {
  await channel.assertQueue(SYNC_EVENT_INSPECTION_QUEUE, {
    durable: true,
    exclusive: false,
    autoDelete: false,
    arguments: {
      'x-queue-type': 'classic',
    },
  });

  for (const eventType of ['data.changed', 'sync.completed', 'sync.failed']) {
    await channel.bindQueue(
      SYNC_EVENT_INSPECTION_QUEUE,
      SYNC_EVENT_EXCHANGE,
      eventType,
    );
  }
}
