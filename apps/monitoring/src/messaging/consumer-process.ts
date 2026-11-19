import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ChannelModel } from 'amqplib';
import { DatabaseService } from '../database/database.service';
import { EventsModule } from '../events/events.module';
import { EventsService } from '../events/events.service';
import { startMonitoringConsumer } from './monitoring-consumer';
import { connectRabbitmq } from './rabbitmq-connection';

let app: INestApplicationContext | undefined;
let connection: ChannelModel | undefined;
let stopping = false;

async function stop(failed: boolean): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;

  if (failed) {
    process.exitCode = 1;
  }

  try {
    await connection?.close();
  } catch {
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}

function requestStop(failed: boolean): void {
  void stop(failed).catch(() => {
    console.error('No se pudo cerrar Monitoring correctamente');
    process.exitCode = 1;
  });
}

function onFailure(): void {
  if (stopping) {
    return;
  }

  console.error('El consumidor de Monitoring se ha detenido por un error');
  requestStop(true);
}

async function main(): Promise<void> {
  app = await NestFactory.createApplicationContext(EventsModule, {
    logger: false,
    abortOnError: false,
  });

  await app.get(DatabaseService).checkConnection();

  connection = await connectRabbitmq();
  connection.on('error', onFailure);
  connection.on('close', onFailure);

  const channel = await connection.createConfirmChannel();

  channel.on('error', onFailure);
  channel.on('close', onFailure);

  process.once('SIGTERM', () => requestStop(false));
  process.once('SIGINT', () => requestStop(false));

  await startMonitoringConsumer(channel, app.get(EventsService), onFailure);

  if (!stopping) {
    console.log('Consumidor de Monitoring activo');
  }
}

if (require.main === module) {
  void main().catch(onFailure);
}
