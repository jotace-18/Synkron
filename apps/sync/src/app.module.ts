import { Module } from '@nestjs/common';
import { ConnectionTargetPolicyService } from './connections/connection-target-policy.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { ConnectionsService } from './connections/connections.service';
import { SessionClientService } from './session-client/session-client.service';
import { ConnectionsController } from './connections/connections.controller';
import { CredentialsService } from './credentials/credentials.service';
import { ConnectionProbeService } from './connections/connection-probe.service';
import { ActivitiesService } from './activities/activities.service';
import { AcademicReaderService } from './connectors/academic/academic-reader.service';
import { AcademicImportService } from './imports/academic-import.service';
import { DefinitionsService } from './definitions/definitions.service';
import { DefinitionsController } from './definitions/definitions.controller';
import { RunsController } from './runs/runs.controller';
import { RunsService } from './runs/runs.service';

@Module({
  imports: [],
  controllers: [
    AppController,
    ConnectionsController,
    DefinitionsController,
    RunsController,
  ],
  providers: [
    ConnectionTargetPolicyService,
    AppService,
    DatabaseService,
    ConnectionsService,
    SessionClientService,
    CredentialsService,
    ConnectionProbeService,
    ActivitiesService,
    AcademicReaderService,
    AcademicImportService,
    DefinitionsService,
    RunsService,
  ],
})
export class AppModule {}
