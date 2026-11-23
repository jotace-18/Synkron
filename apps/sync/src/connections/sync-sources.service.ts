import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getConnector } from '../connectors/connector-catalog';
import { DatabaseService } from '../database/database.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ConnectionTargetPolicyService } from './connection-target-policy.service';
import type { ConnectionSummary } from './connections.service';
import type { SyncDefinition } from '../definitions/definition.types';
import type { CreateSyncSourceDto } from './dto/create-sync-source.dto';

export type SyncSourceResult = {
  connection: ConnectionSummary;
  definition: SyncDefinition;
};

@Injectable()
export class SyncSourcesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentials: CredentialsService,
    private readonly targets: ConnectionTargetPolicyService,
  ) {}

  async create(
    tenantId: string,
    input: CreateSyncSourceDto,
  ): Promise<SyncSourceResult> {
    const url = this.targets.assertAllowed(input.base_url).toString();
    const connector = getConnector(input.connector);
    if (!connector || input.auth.type !== 'bearer')
      throw new BadRequestException('La fuente requiere una credencial Bearer');
    const token = input.auth.token;
    try {
      return await this.database.transaction(async (client) => {
        // Serialize retries for this owner and target; never include credentials in lock keys.
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [JSON.stringify([tenantId, url, input.connector])],
        );
        const previous = await client.query<{
          id: string;
          credentials_encrypted: string | null;
          definition_id: string;
          active: boolean;
        }>(
          `SELECT c.id, c.credentials_encrypted, d.id AS definition_id, (c.enabled AND d.enabled) AS active FROM sync.connections c
           JOIN sync.definitions d ON d.tenant_id = c.tenant_id AND d.source_connection_id = c.id
           WHERE c.tenant_id = $1 AND c.base_url = $2 AND c.input_mode = 'pull'
             AND d.connector = $3 AND d.source_mode = 'pull'
           ORDER BY d.created_at LIMIT 1 FOR UPDATE OF c, d`,
          [tenantId, url, input.connector],
        );
        let connectionId: string;
        let definitionId: string;
        const existing = previous.rows[0];
        if (existing) {
          if (!existing.active)
            throw new ConflictException(
              'La fuente existente está deshabilitada',
            );
          if (
            !existing.credentials_encrypted ||
            this.credentials.decrypt(
              existing.credentials_encrypted,
              tenantId,
              existing.id,
            ) !== token
          ) {
            throw new ConflictException(
              'Ya existe esta fuente con otra credencial. Revisa la conexión existente.',
            );
          }
          connectionId = existing.id;
          definitionId = existing.definition_id;
        } else {
          connectionId = randomUUID();
          const encrypted = this.credentials.encrypt(
            token,
            tenantId,
            connectionId,
          );
          await client.query(
            `INSERT INTO sync.connections (id, tenant_id, name, base_url, auth_type, credentials_encrypted, enabled) VALUES ($1,$2,$3,$4,'bearer',$5,$6)`,
            [connectionId, tenantId, input.name, url, encrypted, input.enabled],
          );
          const definition = await client.query<{ id: string }>(
            `INSERT INTO sync.definitions (tenant_id, source_connection_id, name, connector, source_collection, enabled) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [
              tenantId,
              connectionId,
              input.name,
              input.connector,
              connector.source_collection,
              input.enabled,
            ],
          );
          definitionId = definition.rows[0].id;
        }
        const connection = await client.query<ConnectionSummary>(
          `SELECT id, name, base_url, auth_type, credentials_encrypted IS NOT NULL AS has_credentials, enabled, created_at, updated_at FROM sync.connections WHERE tenant_id=$1 AND id=$2`,
          [tenantId, connectionId],
        );
        const definition = await client.query<SyncDefinition>(
          `SELECT id, name, source_connection_id, connector, source_collection, enabled, created_at, updated_at FROM sync.definitions WHERE tenant_id=$1 AND id=$2`,
          [tenantId, definitionId],
        );
        return {
          connection: connection.rows[0],
          definition: definition.rows[0],
        };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'No se pudo guardar la fuente. Puedes reintentar sin duplicarla.',
      );
    }
  }
}
