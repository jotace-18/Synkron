import { Logger } from '@nestjs/common';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import { connectRabbitmq } from './rabbitmq-connection';
import {
  declareSyncEventExchange,
  SYNC_EVENT_EXCHANGE,
} from './sync-event-exchange';
import { declareSyncEventInspectionQueue } from './sync-event-queue';
import type { SyncEvent } from '../events/sync-event.types';

const logger = new Logger('EventPublisher');

export async function openEventPublisher(): Promise<{
  connection: ChannelModel;
  channel: ConfirmChannel;
}> {
  const connection = await connectRabbitmq();

  try {
    const channel = await connection.createConfirmChannel();

    channel.on('error', () => {
      logger.error('Error en el canal de publicación de eventos');
    });

    await declareSyncEventExchange(channel);
    await declareSyncEventInspectionQueue(channel);

    return { connection, channel };
  } catch {
    await connection.close().catch(() => undefined);
    throw new Error('No se pudo preparar el publicador de eventos');
  }
}

export async function publishSyncEvent(
  channel: ConfirmChannel,
  event: SyncEvent,
): Promise<void> {
  const content = Buffer.from(JSON.stringify(event), 'utf8');

  let returned = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const onReturn = () => {
    returned = true;
  };

  channel.on('return', onReturn);

  try {
    channel.publish(SYNC_EVENT_EXCHANGE, event.event_type, content, {
      persistent: true,
      mandatory: true,
      contentType: 'application/json',
      messageId: event.event_id,
      correlationId: event.correlation_id,
      type: event.event_type,
      appId: event.producer,
    });

    await Promise.race([
      channel.waitForConfirms(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Confirmación de RabbitMQ agotada'));
        }, 10_000);
      }),
    ]);

    if (returned) {
      throw new Error('RabbitMQ devolvió el evento sin encolarlo');
    }
  } catch {
    void channel.close().catch(() => undefined);
    throw new Error('No se pudo confirmar la publicación del evento');
  } finally {
    clearTimeout(timeout);
    channel.off('return', onReturn);
  }
}
