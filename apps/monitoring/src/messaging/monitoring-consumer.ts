import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { EventsService } from '../events/events.service';
import { forwardRejectedEvent } from './forward-rejected-event';
import {
  declareMonitoringEventQueue,
  MONITORING_EVENT_QUEUE,
} from './monitoring-event-queue';
import { processMonitoringEvent } from './process-monitoring-event';

export async function startMonitoringConsumer(
  channel: ConfirmChannel,
  events: EventsService,
  onFailure: (error: unknown) => void,
): Promise<string> {
  await declareMonitoringEventQueue(channel);
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
    const result = await processMonitoringEvent(message.content, events);

    if (result === 'invalid') {
      await forwardRejectedEvent(channel, message);
    }

    channel.ack(message);
  }

  const subscription = await channel.consume(
    MONITORING_EVENT_QUEUE,
    (message) => {
      if (failed) {
        return;
      }

      if (message === null) {
        fail(new Error('RabbitMQ canceló el consumidor de Monitoring'));
        return;
      }

      void handle(message).catch(fail);
    },
    { noAck: false },
  );

  return subscription.consumerTag;
}
