import { DatabaseService } from '../database/database.service';
import { RunJobsService } from './run-jobs.service';
import { runPublisherLoop } from './publisher-loop';
import { openRunPublisher, publishRunMessage } from './run-publisher';

export async function runPublisherProcess(signal: AbortSignal): Promise<void> {
  const database = new DatabaseService();

  try {
    const { connection, channel } = await openRunPublisher();

    try {
      const jobs = new RunJobsService(database);

      console.log('Publicador de ejecuciones activo');

      await runPublisherLoop(
        () =>
          jobs.publishNext((message) => publishRunMessage(channel, message)),
        signal,
      );
    } finally {
      await connection.close();
    }
  } finally {
    await database.onModuleDestroy();
  }
}

if (require.main === module) {
  const controller = new AbortController();
  const stop = () => controller.abort();

  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  void runPublisherProcess(controller.signal)
    .catch(() => {
      console.error('El publicador de ejecuciones se ha detenido por un error');
      process.exitCode = 1;
    })
    .finally(() => {
      process.off('SIGTERM', stop);
      process.off('SIGINT', stop);
    });
}
