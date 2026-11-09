import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service';
import { AcademicReaderService } from '../connectors/academic/academic-reader.service';
import { mapAcademicAssignment } from '../connectors/academic/assignment.mapper';
import { CredentialsService } from '../credentials/credentials.service';
import { DatabaseService } from '../database/database.service';
import type { AcademicImportResult } from './academic-import.types';

@Injectable()
export class AcademicImportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentials: CredentialsService,
    private readonly reader: AcademicReaderService,
    private readonly activities: ActivitiesService,
  ) {}

  async run(
    tenantId: string,
    connectionId: string,
  ): Promise<AcademicImportResult> {
    const result = await this.database.query<{
      id: string;
      base_url: string;
      enabled: boolean;
      auth_type: 'none' | 'bearer';
      credentials_encrypted: string | null;
    }>(
      `SELECT id, base_url, enabled, auth_type, credentials_encrypted
       FROM sync.connections
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, connectionId],
    );

    const connection = result.rows[0];
    if (!connection) {
      throw new NotFoundException('Conexión no encontrada');
    }
    if (!connection.enabled) {
      throw new ConflictException('La conexión está deshabilitada');
    }
    if (connection.auth_type !== 'bearer') {
      throw new BadRequestException(
        'La conexión académica requiere autenticación Bearer',
      );
    }
    if (!connection.credentials_encrypted) {
      throw new ServiceUnavailableException(
        'No se pudo recuperar la credencial',
      );
    }

    let token: string;
    try {
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

    const records = await this.reader.readAll(connection.base_url, token);
    const imports = records.map((record) =>
      mapAcademicAssignment(connection.id, record),
    );
    const summary: AcademicImportResult = {
      connection_id: connection.id,
      read: records.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      retired: 0,
      ignored: 0,
    };

    for (const instruction of imports) {
      if (instruction.action === 'upsert') {
        const saved = await this.activities.save(
          tenantId,
          instruction.activity,
        );
        summary[saved.outcome] += 1;
      } else {
        const retired = await this.activities.retire(tenantId, instruction);
        if (retired.outcome === 'not_found') {
          summary.ignored += 1;
        } else {
          summary[retired.outcome] += 1;
        }
      }
    }

    return summary;
  }
}
