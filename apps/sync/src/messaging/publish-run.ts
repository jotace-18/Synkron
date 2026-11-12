import { DatabaseService } from '../database/database.service';
import { RunJobsService } from './run-jobs.service';
import { openRunPublisher, publishRunMessage } from './run-publisher';

export async function publishOneRun(): Promise<boolean> {
  const database = new DatabaseService();

  try {
    const { connection, channel } = await openRunPublisher();

    try {
      const jobs = new RunJobsService(database);

      return await jobs.publishNext((message) =>
        publishRunMessage(channel, message),
      );
    } finally {
      await connection.close();
    }
  } finally {
    await database.onModuleDestroy();
  }
}

if (require.main === module) {
  void publishOneRun()
    .then((published) => {
      console.log(
        published
          ? 'Trabajo publicado y confirmado por RabbitMQ'
          : 'No hay trabajos pendientes disponibles',
      );
    })
    .catch(() => {
      console.error('No se pudo publicar el trabajo pendiente');
      process.exitCode = 1;
    });
}
