import type { Channel } from 'amqplib';
import { SYNC_RUN_QUEUE } from './sync-run-message';

export async function declareSyncRunQueue(channel: Channel): Promise<void> {
  await channel.assertQueue(SYNC_RUN_QUEUE, {
    durable: true,
    exclusive: false,
    autoDelete: false,
    arguments: {
      'x-queue-type': 'classic',
    },
  });
}
