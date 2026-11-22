import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { SYNC_RUN_QUEUE, SYNC_RUN_REJECTED_QUEUE } from './sync-run-message';

export type RunRejectionReason =
  'invalid_message' | 'run_not_found' | 'run_not_recoverable';

export async function publishRejectedRun(
  channel: ConfirmChannel,
  delivery: ConsumeMessage,
  reason: RunRejectionReason,
): Promise<void> {
  let returned = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const onReturn = () => {
    returned = true;
  };

  channel.on('return', onReturn);

  try {
    channel.sendToQueue(SYNC_RUN_REJECTED_QUEUE, delivery.content, {
      persistent: true,
      mandatory: true,
      contentType: 'application/octet-stream',
      headers: {
        'x-synkron-rejection-reason': reason,
        'x-synkron-original-queue': SYNC_RUN_QUEUE,
      },
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
      throw new Error('RabbitMQ devolvió el mensaje rechazado');
    }
  } catch {
    void channel.close().catch(() => undefined);
    throw new Error('No se pudo confirmar el mensaje rechazado');
  } finally {
    clearTimeout(timeout);
    channel.off('return', onReturn);
  }
}
