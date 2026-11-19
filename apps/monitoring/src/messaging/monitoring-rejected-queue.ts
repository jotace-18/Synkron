import type { Channel } from 'amqplib';

export const MONITORING_REJECTED_QUEUE =
  'synkron.monitoring.events.rejected.v1';

export async function declareMonitoringRejectedQueue(
  channel: Channel,
): Promise<void> {
  await channel.assertQueue(MONITORING_REJECTED_QUEUE, {
    durable: true,
    exclusive: false,
    autoDelete: false,
    arguments: {
      'x-queue-type': 'classic',
    },
  });
}
