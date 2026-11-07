import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { ConnectionsService } from './connections/connections.service';
import { SessionClientService } from './session-client/session-client.service';
import { ConnectionsController } from './connections/connections.controller';

@Module({
  imports: [],
  controllers: [AppController, ConnectionsController],
  providers: [
    AppService,
    DatabaseService,
    ConnectionsService,
    SessionClientService,
  ],
})
export class AppModule {}
