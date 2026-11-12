import { Logger } from '@nestjs/common';
import { connectRabbitmq } from './rabbitmq-connection';
import { declareSyncRunQueue } from './sync-run-queue';
import { SYNC_RUN_QUEUE } from './sync-run-message';

const logger = new Logger('RabbitMQSetup');

export async function setupRabbitmq(): Promise<void> {
  const connection = await connectRabbitmq();

  try {
    const channel = await connection.createChannel();

    channel.on('error', () => {
      logger.error('Error en el canal de preparación de RabbitMQ');
    });

    await declareSyncRunQueue(channel);
    console.log(`Cola disponible: ${SYNC_RUN_QUEUE}`);
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  void setupRabbitmq().catch(() => {
    console.error('No se pudo preparar la cola de ejecuciones');
    process.exitCode = 1;
  });
}
