import { DatabaseService } from '../database/database.service';
import { EventOutboxService } from './event-outbox.service';
import { openEventPublisher, publishSyncEvent } from './event-publisher';
import { runPublisherLoop } from './publisher-loop';

export async function runEventPublisherProcess(
  signal: AbortSignal,
): Promise<void> {
  const database = new DatabaseService();

  try {
    const { connection, channel } = await openEventPublisher();

    try {
      const outbox = new EventOutboxService(database);

      console.log('Publicador de eventos activo');

      await runPublisherLoop(
        () => outbox.publishNext((event) => publishSyncEvent(channel, event)),
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

  void runEventPublisherProcess(controller.signal)
    .catch(() => {
      console.error('El publicador de eventos se ha detenido por un error');
      process.exitCode = 1;
    })
    .finally(() => {
      process.off('SIGTERM', stop);
      process.off('SIGINT', stop);
    });
}
