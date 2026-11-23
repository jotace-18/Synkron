import { BadGatewayException, Injectable } from '@nestjs/common';
import { getEnabledActivityTypes } from '../activities/activity-schema';
import type { ActivityRunLease } from '../activities/activity.types';
import { CanonicalReaderService } from '../connectors/canonical/canonical-reader.service';
import { normalizeIngestionEnvelope } from '../ingestions/parse-ingestion-request';
import { ActivityValidationError } from './activity-import.validation';
import { ConnectorImportTransport } from './connector-import.transport';
import type { ImportResult } from './import.types';
@Injectable()
export class CanonicalImportService {
  constructor(
    private readonly transport: ConnectorImportTransport,
    private readonly reader: CanonicalReaderService,
  ) {}
  run(
    tenantId: string,
    connectionId: string,
    onProgress?: (summary: ImportResult) => void,
    signal?: AbortSignal,
    lease?: ActivityRunLease,
  ): Promise<ImportResult> {
    return this.transport.run(
      'standard.activities',
      {
        readAll: (url, token) => this.reader.readAll(url, token, signal),
        map: (id, value) => {
          try {
            return normalizeIngestionEnvelope(value, {
              tenant_id: tenantId,
              source_connection_id: id,
              source_collection: 'activities',
              allowed_types: getEnabledActivityTypes(),
            });
          } catch (error) {
            if (error instanceof ActivityValidationError)
              throw new BadGatewayException(
                'La fuente no cumple el contrato canónico de actividades',
              );
            throw error;
          }
        },
      },
      tenantId,
      connectionId,
      onProgress,
      signal,
      lease,
    );
  }
}
