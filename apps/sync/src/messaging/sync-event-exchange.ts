import type { Channel } from 'amqplib';

export const SYNC_EVENT_EXCHANGE = 'synkron.events.v1';

export async function declareSyncEventExchange(
  channel: Channel,
): Promise<void> {
  await channel.assertExchange(SYNC_EVENT_EXCHANGE, 'topic', {
    durable: true,
    autoDelete: false,
  });
}
