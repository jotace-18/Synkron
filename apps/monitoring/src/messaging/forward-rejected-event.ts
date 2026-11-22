import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { MONITORING_REJECTED_QUEUE } from './monitoring-rejected-queue';

export async function forwardRejectedEvent(
  channel: ConfirmChannel,
  message: ConsumeMessage,
): Promise<void> {
  let returned = false;

  const onReturn = () => {
    returned = true;
  };

  channel.on('return', onReturn);

  try {
    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(
        MONITORING_REJECTED_QUEUE,
        message.content,
        {
          persistent: true,
          mandatory: true,
          contentType:
            typeof message.properties.contentType === 'string'
              ? message.properties.contentType
              : 'application/octet-stream',
          messageId:
            typeof message.properties.messageId === 'string'
              ? message.properties.messageId
              : undefined,
          correlationId:
            typeof message.properties.correlationId === 'string'
              ? message.properties.correlationId
              : undefined,
        },
        (error: Error | null) => {
          if (error) {
            reject(error);
          } else if (returned) {
            reject(new Error('La cola de rechazados no recibió el mensaje'));
          } else {
            resolve();
          }
        },
      );
    });
  } finally {
    channel.removeListener('return', onReturn);
  }
}
