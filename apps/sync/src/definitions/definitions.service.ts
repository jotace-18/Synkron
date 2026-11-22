import { getConnector } from '../connectors/connector-catalog';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SyncDefinition } from './definition.types';
import type { CreateDefinitionDto } from './dto/create-definition.dto';
import type { ListDefinitionsDto } from './dto/list-definitions.dto';

@Injectable()
export class DefinitionsService {
  constructor(private readonly database: DatabaseService) {}

  async list(
    tenantId: string,
    query: ListDefinitionsDto,
  ): Promise<SyncDefinition[]> {
    const result = await this.database.query<SyncDefinition>(
      `SELECT id, name, source_connection_id, connector, source_collection,
              enabled, created_at, updated_at
       FROM sync.definitions
       WHERE tenant_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT $2 OFFSET $3`,
      [tenantId, query.limit, query.offset],
    );
    return result.rows;
  }

  async get(tenantId: string, definitionId: string): Promise<SyncDefinition> {
    const result = await this.database.query<SyncDefinition>(
      `SELECT
         id,
         name,
         source_connection_id,
         connector,
         source_collection,
         enabled,
         created_at,
         updated_at
       FROM sync.definitions
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, definitionId],
    );

    const definition = result.rows[0];

    if (!definition) {
      throw new NotFoundException('Definición no encontrada');
    }

    return definition;
  }

  async create(
    tenantId: string,
    input: CreateDefinitionDto,
  ): Promise<SyncDefinition> {
    const connector = getConnector(input.connector);
    if (!connector) throw new BadRequestException('Conector no admitido');

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
        if (
          connection.auth_type !== connector.auth_type ||
          (connector.auth_type === 'bearer' && !connection.has_credentials)
        ) {
          throw new BadRequestException(
            'La conexión académica requiere una credencial Bearer',
          );
        }

        const result = await client.query<SyncDefinition>(
          `INSERT INTO sync.definitions (
             tenant_id, source_connection_id, name, connector,
             source_collection, enabled
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, name, source_connection_id, connector,
                     source_collection, enabled, created_at, updated_at`,
          [
            tenantId,
            connection.id,
            input.name,
            input.connector,
            connector.source_collection,
            input.enabled,
          ],
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
