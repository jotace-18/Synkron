import { CanonicalImportService } from '../imports/canonical-import.service';
import { StoredIngestionImporter } from '../ingestions/stored-ingestion.importer';
import { DIRECT_INGESTION_CONNECTOR } from './connector-catalog';
import { AcademicExamsImportService } from '../imports/academic-exams-import.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { AcademicImportService } from '../imports/academic-import.service';
import type { ActivityRunLease } from '../activities/activity.types';
import type { ImportResult } from '../imports/import.types';
import { getConnector } from './connector-catalog';
import type { ConnectorName } from './connector-catalog';

export interface ConnectorImporter {
  run(
    tenantId: string,
    connectionId: string,
    onProgress?: (summary: ImportResult) => void,
    signal?: AbortSignal,
    lease?: ActivityRunLease,
  ): Promise<ImportResult>;
}

@Injectable()
export class ConnectorRegistryService {
  private readonly importers: Record<ConnectorName, ConnectorImporter>;

  constructor(
    academic: AcademicImportService,
    exams: AcademicExamsImportService,
    private readonly ingestion: StoredIngestionImporter,
    canonical: CanonicalImportService,
  ) {
    this.importers = {
      'academic.assignments': academic,
      'academic.exams': exams,
      'standard.activities': canonical,
    };
  }

  get(name: string, sourceCollection: string): ConnectorImporter {
    if (name === DIRECT_INGESTION_CONNECTOR && sourceCollection.trim())
      return this.ingestion;
    const connector = getConnector(name);
    if (!connector || connector.source_collection !== sourceCollection) {
      throw new BadRequestException('Conector o colección no admitidos');
    }
    return this.importers[name as ConnectorName];
  }
}
