import { Logger } from '@nestjs/common';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { connectRabbitmq } from './rabbitmq-connection';
import { declareSyncRunQueue } from './sync-run-queue';
import type { ClaimedSyncRun, SyncRun } from '../runs/run.types';
import type { RunsService } from '../runs/runs.service';
import {
  decodeSyncRunMessage,
  SYNC_RUN_QUEUE,
  type SyncRunMessage,
} from './sync-run-message';

const logger = new Logger('RunWorker');

export async function openRunWorker(): Promise<{
  connection: ChannelModel;
  channel: Channel;
}> {
  const connection = await connectRabbitmq();

  try {
    const channel = await connection.createChannel();

    channel.on('error', () => {
      logger.error('Error en el canal del worker');
    });

    await declareSyncRunQueue(channel);
    await channel.prefetch(1, false);

    return { connection, channel };
  } catch {
    await connection.close().catch(() => undefined);
    throw new Error('No se pudo preparar el worker de ejecuciones');
  }
}

export class InvalidRunDeliveryError extends Error {
  constructor() {
    super('Mensaje de ejecución no válido');
  }
}

export async function claimRunDelivery(
  delivery: ConsumeMessage,
  runs: RunsService,
): Promise<ClaimedSyncRun | null> {
  let message: SyncRunMessage;

  try {
    message = decodeSyncRunMessage(delivery.content);

    const contentType: unknown = delivery.properties.contentType;
    const messageId: unknown = delivery.properties.messageId;

    if (
      contentType !== 'application/json' ||
      typeof messageId !== 'string' ||
      messageId.toLowerCase() !== message.run_id
    ) {
      throw new InvalidRunDeliveryError();
    }
  } catch {
    throw new InvalidRunDeliveryError();
  }

  return runs.claimQueued(message.tenant_id, message.run_id);
}

export async function registerRunConsumer(
  channel: Channel,
  handleDelivery: (delivery: ConsumeMessage) => Promise<void>,
  onFailure: (error: unknown) => void,
): Promise<string> {
  const consumer = await channel.consume(
    SYNC_RUN_QUEUE,
    (delivery) => {
      if (!delivery) {
        onFailure(new Error('RabbitMQ canceló el consumidor'));
        return;
      }

      void Promise.resolve()
        .then(() => handleDelivery(delivery))
        .catch(onFailure);
    },
    { noAck: false },
  );

  return consumer.consumerTag;
}

export async function handleRunDelivery(
  channel: Channel,
  delivery: ConsumeMessage,
  runs: RunsService,
  processRun: (run: ClaimedSyncRun) => Promise<void>,
): Promise<void> {
  const claimed = await claimRunDelivery(delivery, runs);
  let saved: SyncRun;

  if (claimed) {
    await processRun(claimed);
    saved = await runs.get(claimed.tenant_id, claimed.id);
  } else {
    const message = decodeSyncRunMessage(delivery.content);
    saved = await runs.get(message.tenant_id, message.run_id);
  }

  if (saved.status !== 'completed' && saved.status !== 'failed') {
    throw new Error('La ejecución todavía no tiene un resultado guardado');
  }

  channel.ack(delivery);
}
