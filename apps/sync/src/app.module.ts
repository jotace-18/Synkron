import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { ConnectionsService } from './connections/connections.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, DatabaseService, ConnectionsService],
})
export class AppModule {}
