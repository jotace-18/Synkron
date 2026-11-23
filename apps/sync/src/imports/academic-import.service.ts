import { Injectable } from '@nestjs/common';
import type { ActivityRunLease } from '../activities/activity.types';
import { AcademicReaderService } from '../connectors/academic/academic-reader.service';
import { mapAcademicAssignment } from '../connectors/academic/assignment.mapper';
import { ConnectorImportTransport } from './connector-import.transport';
import type { ImportResult } from './import.types';

@Injectable()
export class AcademicImportService {
  constructor(
    private readonly transport: ConnectorImportTransport,
    private readonly reader: AcademicReaderService,
  ) {}

  run(
    tenantId: string,
    connectionId: string,
    onProgress?: (summary: ImportResult) => void,
    signal?: AbortSignal,
    lease?: ActivityRunLease,
  ): Promise<ImportResult> {
    return this.transport.run(
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
