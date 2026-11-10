import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SyncDefinition } from './definition.types';
import type { CreateDefinitionDto } from './dto/create-definition.dto';

@Injectable()
export class DefinitionsService {
  constructor(private readonly database: DatabaseService) {}

  async create(
    tenantId: string,
    input: CreateDefinitionDto,
  ): Promise<SyncDefinition> {
    try {
      return await this.database.transaction<SyncDefinition>(async (client) => {
        const source = await client.query<{
          id: string;
          enabled: boolean;
          auth_type: 'none' | 'bearer';
          has_credentials: boolean;
        }>(
          `SELECT id, enabled, auth_type,
                  credentials_encrypted IS NOT NULL AS has_credentials
           FROM sync.connections
           WHERE tenant_id = $1 AND id = $2
           FOR SHARE`,
          [tenantId, input.source_connection_id],
        );

        const connection = source.rows[0];
        if (!connection) {
          throw new NotFoundException('Conexión no encontrada');
        }
        if (!connection.enabled) {
          throw new ConflictException('La conexión está deshabilitada');
        }
        if (connection.auth_type !== 'bearer' || !connection.has_credentials) {
          throw new BadRequestException(
            'La conexión académica requiere una credencial Bearer',
          );
        }

        const result = await client.query<SyncDefinition>(
          `INSERT INTO sync.definitions (
             tenant_id, source_connection_id, name, connector,
             source_collection, enabled
           ) VALUES ($1, $2, $3, $4, 'assignments', $5)
           RETURNING id, name, source_connection_id, connector,
                     source_collection, enabled, created_at, updated_at`,
          [tenantId, connection.id, input.name, input.connector, input.enabled],
        );
        return result.rows[0];
      });
    } catch (error: unknown) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'definitions_active_source_unique'
      ) {
        throw new ConflictException(
          'Ya existe una definición activa para esta conexión y colección',
        );
      }
      throw error;
    }
  }
}
