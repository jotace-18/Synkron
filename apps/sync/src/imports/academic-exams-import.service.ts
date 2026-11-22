import { Injectable } from '@nestjs/common';
import type { ActivityRunLease } from '../activities/activity.types';
import { AcademicExamsReaderService } from '../connectors/academic/academic-exams-reader.service';
import { mapAcademicExam } from '../connectors/academic/exam.mapper';
import { ConnectorImportTransport } from './connector-import.transport';
import type { ImportResult } from './import.types';

@Injectable()
export class AcademicExamsImportService {
  constructor(
    private readonly transport: ConnectorImportTransport,
    private readonly reader: AcademicExamsReaderService,
  ) {}

  run(
    tenantId: string,
    connectionId: string,
    onProgress?: (summary: ImportResult) => void,
    signal?: AbortSignal,
    lease?: ActivityRunLease,
  ): Promise<ImportResult> {
    return this.transport.run(
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
