import { Injectable } from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service';
import type { ActivityRunLease } from '../activities/activity.types';
import { AcademicReaderService } from '../connectors/academic/academic-reader.service';
import { mapAcademicAssignment } from '../connectors/academic/assignment.mapper';
import { CredentialsService } from '../credentials/credentials.service';
import { DatabaseService } from '../database/database.service';
import { ActivityImportPipeline } from './activity-import.pipeline';
import type { ImportResult } from './import.types';

@Injectable()
export class AcademicImportService {
  private readonly pipeline: ActivityImportPipeline;

  constructor(
    database: DatabaseService,
    credentials: CredentialsService,
    private readonly reader: AcademicReaderService,
    activities: ActivitiesService,
  ) {
    this.pipeline = new ActivityImportPipeline(
      database,
      credentials,
      activities,
    );
  }

  run(
    tenantId: string,
    connectionId: string,
    onProgress?: (summary: ImportResult) => void,
    signal?: AbortSignal,
    lease?: ActivityRunLease,
  ): Promise<ImportResult> {
    return this.pipeline.run(
      'academic.assignments',
      {
        readAll: (url, token) => this.reader.readAll(url, token),
        map: mapAcademicAssignment,
      },
      tenantId,
      connectionId,
      onProgress,
      signal,
      lease,
    );
  }
}
