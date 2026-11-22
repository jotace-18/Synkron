import { once } from 'node:events';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { runWorkerLoop } from './worker-loop';
import { RunsService } from '../runs/runs.service';
import { RunProcessorService } from '../runs/run-processor.service';
import {
  handleRunDelivery,
  openRunWorker,
  registerRunConsumer,
} from './run-worker';

export async function runWorkerProcess(signal: AbortSignal): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });

  const failureStop = new AbortController();
  const stop = AbortSignal.any([signal, failureStop.signal]);

  let hasFailed = false;
  let closing = false;
  let active: Promise<void> = Promise.resolve();

  const fail = () => {
    hasFailed = true;
    failureStop.abort();
  };

  try {
    const runs = app.get(RunsService);
    const processor = app.get(RunProcessorService);
    const { connection, channel } = await openRunWorker();

    channel.on('error', fail);
    channel.on('close', () => {
      if (!closing) fail();
    });

    try {
      const consumerTag = await registerRunConsumer(
        channel,
        (delivery) => {
          if (stop.aborted) return Promise.resolve();

          active = handleRunDelivery(
            channel,
            delivery,
            runs,
            (run) => processor.process(run),
            stop,
          );

          return active;
        },
        fail,
      );

      console.log('Worker de ejecuciones activo');

      try {
        if (!stop.aborted) {
          await once(stop, 'abort');
        }
      } finally {
        closing = true;
        await channel.cancel(consumerTag).catch(() => undefined);
        await active;
      }
    } finally {
      closing = true;
      await connection.close();
    }

    if (hasFailed) {
      throw new Error('El worker se detuvo inesperadamente');
    }
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  const controller = new AbortController();
  const stop = () => controller.abort();

  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  void runWorkerLoop(
    () => runWorkerProcess(controller.signal),
    controller.signal,
  )
    .catch(() => {
      console.error('El worker de ejecuciones se ha detenido por un error');
      process.exitCode = 1;
    })
    .finally(() => {
      process.off('SIGTERM', stop);
      process.off('SIGINT', stop);
    });
}
