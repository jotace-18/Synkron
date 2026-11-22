import { Logger } from '@nestjs/common';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import { connectRabbitmq } from './rabbitmq-connection';
import { declareSyncRunQueue } from './sync-run-queue';
import {
  parseSyncRunMessage,
  SYNC_RUN_QUEUE,
  type SyncRunMessage,
} from './sync-run-message';

const logger = new Logger('RunPublisher');

export async function openRunPublisher(): Promise<{
  connection: ChannelModel;
  channel: ConfirmChannel;
}> {
  const connection = await connectRabbitmq();

  try {
    const channel = await connection.createConfirmChannel();

    channel.on('error', () => {
      logger.error('Error en el canal de publicación de ejecuciones');
    });

    await declareSyncRunQueue(channel);

    return { connection, channel };
  } catch {
    await connection.close().catch(() => undefined);
    throw new Error('No se pudo preparar el publicador de ejecuciones');
  }
}

export async function publishRunMessage(
  channel: ConfirmChannel,
  message: SyncRunMessage,
): Promise<void> {
  const validated = parseSyncRunMessage(message);
  const content = Buffer.from(JSON.stringify(validated), 'utf8');

  let returned = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const onReturn = () => {
    returned = true;
  };

  channel.on('return', onReturn);

  try {
    channel.sendToQueue(SYNC_RUN_QUEUE, content, {
      persistent: true,
      mandatory: true,
      contentType: 'application/json',
      messageId: validated.run_id,
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
      throw new Error('RabbitMQ devolvió el mensaje sin encolarlo');
    }
  } catch {
    // Release the pending-job transaction even if closing a broken channel stalls.
    void channel.close().catch(() => undefined);
    throw new Error('No se pudo confirmar la publicación de la ejecución');
  } finally {
    clearTimeout(timeout);
    channel.off('return', onReturn);
  }
}
