import { Injectable } from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service';
import type { ActivityRunLease } from '../activities/activity.types';
import { AcademicExamsReaderService } from '../connectors/academic/academic-exams-reader.service';
import { mapAcademicExam } from '../connectors/academic/exam.mapper';
import { CredentialsService } from '../credentials/credentials.service';
import { DatabaseService } from '../database/database.service';
import { ActivityImportPipeline } from './activity-import.pipeline';
import type { ImportResult } from './import.types';

@Injectable()
export class AcademicExamsImportService {
  private readonly pipeline: ActivityImportPipeline;

  constructor(
    database: DatabaseService,
    credentials: CredentialsService,
    private readonly reader: AcademicExamsReaderService,
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
      'academic.exams',
      {
        readAll: (url, token) => this.reader.readAll(url, token),
        map: mapAcademicExam,
      },
      tenantId,
      connectionId,
      onProgress,
      signal,
      lease,
    );
  }
}
