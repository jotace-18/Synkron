import type { Channel } from 'amqplib';
import { RULE_EVENT_TYPES } from '../rules/rule.types';

export const SYNC_EVENT_EXCHANGE = 'synkron.events.v1';

export const AUTOMATION_EVENT_QUEUE = 'synkron.automation.events.v1';

export const AUTOMATION_REJECTED_QUEUE =
  'synkron.automation.events.rejected.v1';

export async function declareAutomationEventQueue(
  channel: Channel,
): Promise<void> {
  await channel.assertExchange(SYNC_EVENT_EXCHANGE, 'topic', {
    durable: true,
    autoDelete: false,
  });

  for (const queue of [AUTOMATION_EVENT_QUEUE, AUTOMATION_REJECTED_QUEUE]) {
    await channel.assertQueue(queue, {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: {
        'x-queue-type': 'classic',
      },
    });
  }

  for (const eventType of RULE_EVENT_TYPES) {
    await channel.bindQueue(
      AUTOMATION_EVENT_QUEUE,
      SYNC_EVENT_EXCHANGE,
      eventType,
    );
  }
}
