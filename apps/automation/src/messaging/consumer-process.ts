import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ChannelModel } from 'amqplib';
import { DatabaseService } from '../database/database.service';
import { RuleProcessingModule } from '../rules/rule-processing.module';
import { RuleProcessorService } from '../rules/rule-processor.service';
import { startAutomationConsumer } from './automation-consumer';
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
    console.error('No se pudo cerrar Automation correctamente');
    process.exitCode = 1;
  });
}

function onFailure(): void {
  if (stopping) {
    return;
  }

  console.error('El consumidor de Automation se ha detenido por un error');
  requestStop(true);
}

async function main(): Promise<void> {
  app = await NestFactory.createApplicationContext(RuleProcessingModule, {
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

  await startAutomationConsumer(
    channel,
    app.get(RuleProcessorService),
    onFailure,
  );

  if (!stopping) {
    console.log('Consumidor de Automation activo');
  }
}

if (require.main === module) {
  void main().catch(onFailure);
}
