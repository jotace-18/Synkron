import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { parseSyncEvent } from '../events/parse-sync-event';
import type { SyncEvent } from '../events/sync-event.types';
import type { RuleProcessorService } from '../rules/rule-processor.service';
import {
  AUTOMATION_EVENT_QUEUE,
  declareAutomationEventQueue,
} from './automation-event-queue';
import { forwardRejectedEvent } from './forward-rejected-event';

function readEvent(content: Buffer): SyncEvent | null {
  try {
    const value: unknown = JSON.parse(content.toString('utf8'));
    return parseSyncEvent(value);
  } catch {
    return null;
  }
}

export async function startAutomationConsumer(
  channel: ConfirmChannel,
  rules: RuleProcessorService,
  onFailure: (error: unknown) => void,
): Promise<string> {
  await declareAutomationEventQueue(channel);
  await channel.prefetch(1);

  let failed = false;

  function fail(error: unknown): void {
    if (failed) {
      return;
    }

    failed = true;
    onFailure(error);
  }

  async function handle(message: ConsumeMessage): Promise<void> {
    const event = readEvent(message.content);

    if (event) {
      await rules.process(event);
    } else {
      await forwardRejectedEvent(channel, message);
    }

    channel.ack(message);
  }

  const subscription = await channel.consume(
    AUTOMATION_EVENT_QUEUE,
    (message) => {
      if (failed) {
        return;
      }

      if (message === null) {
        fail(new Error('RabbitMQ canceló el consumidor de Automation'));
        return;
      }

      void handle(message).catch(fail);
    },
    { noAck: false },
  );

  return subscription.consumerTag;
}
