import { connectRabbitmq } from './rabbitmq-connection';
import {
  declareMonitoringEventQueue,
  MONITORING_EVENT_QUEUE,
} from './monitoring-event-queue';

export async function setupRabbitmq(): Promise<void> {
  const connection = await connectRabbitmq();

  try {
    const channel = await connection.createChannel();

    channel.on('error', () => {
      console.error('Error en el canal de preparación de Monitoring');
    });

    await declareMonitoringEventQueue(channel);
    console.log(`Cola disponible: ${MONITORING_EVENT_QUEUE}`);
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  void setupRabbitmq().catch(() => {
    console.error('No se pudo preparar RabbitMQ para Monitoring');
    process.exitCode = 1;
  });
}
