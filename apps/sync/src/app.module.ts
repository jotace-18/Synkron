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
import { ActivitiesController } from './activities/activities.controller';
import { AcademicReaderService } from './connectors/academic/academic-reader.service';
import { AcademicImportService } from './imports/academic-import.service';
import { DefinitionsService } from './definitions/definitions.service';
import { DefinitionsController } from './definitions/definitions.controller';
import { RunsController } from './runs/runs.controller';
import { RunsService } from './runs/runs.service';
import { RunJobsService } from './messaging/run-jobs.service';
import { RunProcessorService } from './runs/run-processor.service';
import { AutomationRunsController } from './internals/automation-runs.controller';
import { AutomationServiceGuard } from './internals/automation-service.guard';
import { AutomationDefinitionsController } from './internals/automation-definitions.controller';

@Module({
  imports: [],
  controllers: [
    AppController,
    ConnectionsController,
    ActivitiesController,
    DefinitionsController,
    RunsController,
    AutomationRunsController,
    AutomationDefinitionsController
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
    RunJobsService,
    RunProcessorService,
    AutomationServiceGuard,
  ],
})
export class AppModule {}
