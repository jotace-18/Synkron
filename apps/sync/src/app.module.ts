import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { ConnectionsService } from './connections/connections.service';
import { SessionClientService } from './session-client/session-client.service';
import { ConnectionsController } from './connections/connections.controller';
import { CredentialsService } from './credentials/credentials.service';

@Module({
  imports: [],
  controllers: [AppController, ConnectionsController],
  providers: [
    AppService,
    DatabaseService,
    ConnectionsService,
    SessionClientService,
    CredentialsService,
  ],
})
export class AppModule {}
