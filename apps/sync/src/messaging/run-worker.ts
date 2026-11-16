import { setTimeout as delay } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import type {
  Channel,
  ChannelModel,
  ConsumeMessage,
  ConfirmChannel,
} from 'amqplib';
import { connectRabbitmq } from './rabbitmq-connection';
import { declareSyncRunQueue } from './sync-run-queue';
import type { ClaimedSyncRun } from '../runs/run.types';
import type { RunsService } from '../runs/runs.service';
import {
  decodeSyncRunMessage,
  SYNC_RUN_QUEUE,
  type SyncRunMessage,
} from './sync-run-message';
import { publishRejectedRun } from './rejected-run-publisher';

const logger = new Logger('RunWorker');

export async function openRunWorker(): Promise<{
  connection: ChannelModel;
  channel: ConfirmChannel;
}> {
  const connection = await connectRabbitmq();

  try {
    const channel = await connection.createConfirmChannel();

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
  channel: ConfirmChannel,
  delivery: ConsumeMessage,
  runs: RunsService,
  processRun: (run: ClaimedSyncRun) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  while (!signal?.aborted) {
    let claimed: ClaimedSyncRun | null;

    try {
      claimed = await claimRunDelivery(delivery, runs);
    } catch (error: unknown) {
      if (!(error instanceof InvalidRunDeliveryError)) throw error;
      await publishRejectedRun(channel, delivery, 'invalid_message');
      channel.ack(delivery);
      return;
    }

    if (claimed) {
      // Work already acquired drains on shutdown; only idle waits are aborted.
      await processRun(claimed);
      const saved = await runs.get(claimed.tenant_id, claimed.id);
      if (saved.status !== 'completed' && saved.status !== 'failed') {
        throw new Error('La ejecución todavía no tiene un resultado guardado');
      }
      channel.ack(delivery);
      return;
    }

    const message = decodeSyncRunMessage(delivery.content);
    const state = await runs.getDeliveryState(
      message.tenant_id,
      message.run_id,
    );

    if (!state) {
      await publishRejectedRun(channel, delivery, 'run_not_found');
      channel.ack(delivery);
      return;
    }

    if (state.status === 'completed' || state.status === 'failed') {
      channel.ack(delivery);
      return;
    }

    if (
      !state.source_supported ||
      (state.status === 'running' && state.lease_expires_at === null)
    ) {
      await publishRejectedRun(channel, delivery, 'run_not_recoverable');
      channel.ack(delivery);
      return;
    }

    // Keep this delivery unacknowledged. A later claim can recover an expired
    // lease, or the next read can observe the other worker's terminal result.
    try {
      await delay(1_000, undefined, { signal });
    } catch (error: unknown) {
      if (signal?.aborted) return;
      throw error;
    }
  }
}
