import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  private readonly pool = new Pool({
    max: 5,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
  });

  constructor() {
    this.pool.on('error', () => {
      this.logger.error('Se perdió la conexión inactiva con PostgreSQl');
    });
  }

  async checkConnection(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  query<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
    return this.pool.query<T>(sql, values);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
