import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

@Injectable()
export class AppService {
  constructor(private readonly database: DatabaseService) {}

  async getHealth() {
    try {
      await this.database.checkConnection();
    } catch {
      throw new ServiceUnavailableException('PostgreSQL no está disponible');
    }

    return {
      status: 'ok',
      service: 'sync',
      database: 'up',
    };
  }
}
