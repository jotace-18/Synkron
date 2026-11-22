import type { Channel } from 'amqplib';
import { declareMonitoringRejectedQueue } from './monitoring-rejected-queue';

export const SYNC_EVENT_EXCHANGE = 'synkron.events.v1';

export const MONITORING_EVENT_QUEUE = 'synkron.monitoring.events.v1';

export const MONITORING_EVENT_TYPES = [
  'data.changed',
  'sync.completed',
  'sync.failed',
] as const;

export async function declareMonitoringEventQueue(
  channel: Channel,
): Promise<void> {
  await declareMonitoringRejectedQueue(channel);

  await channel.assertExchange(SYNC_EVENT_EXCHANGE, 'topic', {
    durable: true,
    autoDelete: false,
  });

  await channel.assertQueue(MONITORING_EVENT_QUEUE, {
    durable: true,
    exclusive: false,
    autoDelete: false,
    arguments: {
      'x-queue-type': 'classic',
    },
  });

  for (const eventType of MONITORING_EVENT_TYPES) {
    await channel.bindQueue(
      MONITORING_EVENT_QUEUE,
      SYNC_EVENT_EXCHANGE,
      eventType,
    );
  }
}
