import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SessionClientService } from '../session-client/session-client.service';
import { SessionGuard } from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { SyncClientService } from '../sync-client/sync-client.service';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  controllers: [RulesController],
  providers: [
    DatabaseService,
    SessionClientService,
    SessionGuard,
    WriteSessionGuard,
    SyncClientService,
    RulesService,
  ],
})
export class RulesModule {}
