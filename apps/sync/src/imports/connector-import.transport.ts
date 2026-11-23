import { getEnabledActivityTypes } from '../activities/activity-schema';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  ActivityImport,
  ActivityRunLease,
} from '../activities/activity.types';
import { getConnector } from '../connectors/connector-catalog';
import type { ConnectorName } from '../connectors/connector-catalog';
import { CredentialsService } from '../credentials/credentials.service';
import { DatabaseService } from '../database/database.service';
import { ActivityImportPipeline } from './activity-import.pipeline';
import { ActivityValidationError } from './activity-import.validation';
import { emptyImportResult } from './import-result';
import type { ImportResult } from './import.types';

export interface SourceImportAdapter<T> {
  readAll: (url: string, token: string) => Promise<T[]>;
  map: (connectionId: string, record: T) => ActivityImport;
}

@Injectable()
export class ConnectorImportTransport {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentials: CredentialsService,
    private readonly pipeline: ActivityImportPipeline,
  ) {}

  async run<T>(
    connectorName: ConnectorName,
    adapter: SourceImportAdapter<T>,
    tenantId: string,
    connectionId: string,
    onProgress?: (summary: ImportResult) => void,
    signal?: AbortSignal,
    lease?: ActivityRunLease,
  ): Promise<ImportResult> {
    signal?.throwIfAborted();
    const connector = getConnector(connectorName);
    if (!connector) throw new BadRequestException('Conector no admitido');

    const result = await this.database.query<{
      id: string;
      base_url: string;
      enabled: boolean;
      auth_type: 'none' | 'bearer';
      credentials_encrypted: string | null;
    }>(
      `SELECT id, base_url, enabled, auth_type, credentials_encrypted
       FROM sync.connections WHERE tenant_id = $1 AND id = $2`,
      [tenantId, connectionId],
    );
    const connection = result.rows[0];
    if (!connection) throw new NotFoundException('Conexión no encontrada');
    if (!connection.enabled)
      throw new ConflictException('La conexión está deshabilitada');
    if (connection.auth_type !== connector.auth_type)
      throw new BadRequestException(
        'La conexión requiere autenticación Bearer',
      );
    signal?.throwIfAborted();

    let token: string;
    try {
      if (!connection.credentials_encrypted)
        throw new Error('Missing credential');
      token = this.credentials.decrypt(
        connection.credentials_encrypted,
        tenantId,
        connection.id,
      );
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo recuperar la credencial',
      );
    }
    const records = await adapter.readAll(connection.base_url, token);
    signal?.throwIfAborted();
    const instructions = (() => {
      try {
        return records.map((record) => adapter.map(connection.id, record));
      } catch (error) {
        onProgress?.(emptyImportResult(connection.id, records.length));
        throw error;
      }
    })();

    try {
      return await this.pipeline.run(
        {
          tenant_id: tenantId,
          source_connection_id: connection.id,
          source_collection: connector.source_collection,
          allowed_types:
            connector.activity_type === null
              ? getEnabledActivityTypes()
              : [connector.activity_type],
        },
        instructions,
        onProgress,
        signal,
        lease,
      );
    } catch (error) {
      if (error instanceof ActivityValidationError) {
        throw new BadGatewayException(
          'El conector produjo una actividad normalizada inválida',
        );
      }
      throw error;
    }
  }
}
