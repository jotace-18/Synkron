import { Logger } from '@nestjs/common';
import { connect, type ChannelModel } from 'amqplib';

const logger = new Logger('RabbitMQ');

export async function connectRabbitmq(): Promise<ChannelModel> {
  const hostname = process.env.RABBITMQ_HOST;
  const username = process.env.RABBITMQ_USER;
  const password = process.env.RABBITMQ_PASSWORD;
  const vhost = process.env.RABBITMQ_VHOST;
  const port = Number(process.env.RABBITMQ_PORT ?? '5672');

  if (
    !hostname ||
    !username ||
    !password ||
    !vhost ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('Configuración de RabbitMQ incompleta o inválida');
  }

  try {
    const connection = await connect(
      {
        protocol: 'amqp',
        hostname,
        port,
        username,
        password,
        vhost,
        heartbeat: 10,
      },
      { timeout: 5000 },
    );

    connection.on('error', () => {
      logger.error('Error en la conexión con RabbitMQ');
    });

    return connection;
  } catch {
    throw new Error('No se pudo conectar con RabbitMQ');
  }
}
