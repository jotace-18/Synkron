import { SyncSourcesController } from './connections/sync-sources.controller';
import { SyncSourcesService } from './connections/sync-sources.service';
import { CanonicalImportService } from './imports/canonical-import.service';
import { CanonicalReaderService } from './connectors/canonical/canonical-reader.service';
import { IngestionSourcesService } from './ingestions/ingestion-sources.service';
import { IngestionSourceGuard } from './ingestions/ingestion-source.guard';
import { IngestionsService } from './ingestions/ingestions.service';
import { StoredIngestionImporter } from './ingestions/stored-ingestion.importer';
import { IngestionsController } from './ingestions/ingestions.controller';
import { IngestionSourcesController } from './ingestions/ingestion-sources.controller';
import { ConnectorImportTransport } from './imports/connector-import.transport';
import { ActivityImportPipeline } from './imports/activity-import.pipeline';
import { AcademicExamsReaderService } from './connectors/academic/academic-exams-reader.service';
import { AcademicExamsImportService } from './imports/academic-exams-import.service';
import { ConnectorRegistryService } from './connectors/connector-registry.service';
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
import { AutomationActivitiesController } from './internals/automation-activities.controller';

@Module({
  imports: [],
  controllers: [
    AppController,
    IngestionsController,
    IngestionSourcesController,
    ConnectionsController,
    SyncSourcesController,
    ActivitiesController,
    DefinitionsController,
    RunsController,
    AutomationRunsController,
    AutomationDefinitionsController,
    AutomationActivitiesController,
  ],
  providers: [
    CanonicalReaderService,
    CanonicalImportService,
    ConnectionTargetPolicyService,
    IngestionSourcesService,
    IngestionSourceGuard,
    IngestionsService,
    StoredIngestionImporter,
    AppService,
    DatabaseService,
    ConnectionsService,
    SyncSourcesService,
    SessionClientService,
    CredentialsService,
    ConnectionProbeService,
    ActivitiesService,
    AcademicReaderService,
    AcademicExamsReaderService,
    AcademicExamsImportService,
    AcademicImportService,
    ActivityImportPipeline,
    ConnectorImportTransport,
    ConnectorRegistryService,
    DefinitionsService,
    RunsService,
    RunJobsService,
    RunProcessorService,
    AutomationServiceGuard,
  ],
})
export class AppModule {}
