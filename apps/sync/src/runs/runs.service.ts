import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SyncRun } from './run.types';
import { validateRunRequestKey } from './validate-run-request-key';

const publicColumns = `id, definition_id, status, created_at, started_at, finished_at,
  read_count, created_count, updated_count, unchanged_count, retired_count, ignored_count,
  error_code, error_message`;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class RunsService {
  constructor(private readonly database: DatabaseService) {}

  async createQueued(
    tenantId: string,
    definitionId: string,
    requestKey: string = randomUUID(),
  ): Promise<SyncRun> {
    validateRunRequestKey(requestKey);
    const keyHash = hash(requestKey);
    const fingerprint = hash(
      `create-sync-run:${definitionId.toLowerCase()}:{}`,
    );
    return this.database.transaction<SyncRun>(async (client) => {
      // Serialize retries of this account/key across application processes.
      // The unique index is an additional database invariant.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`sync-run:${tenantId.toLowerCase()}:${keyHash}`],
      );
      const existing = await client.query<
        SyncRun & { request_fingerprint: string }
      >(
        `SELECT ${publicColumns}, request_fingerprint FROM sync.runs
         WHERE tenant_id = $1 AND request_key_hash = $2`,
        [tenantId, keyHash],
      );
      if (existing.rows[0]) {
        const { request_fingerprint, ...run } = existing.rows[0];
        if (request_fingerprint !== fingerprint) {
          throw new ConflictException(
            'La clave de idempotencia ya se utilizó para otra solicitud',
          );
        }
        return run;
      }
      const result = await client.query<{
        id: string;
        source_connection_id: string;
        connector: string;
        source_collection: string;
        enabled: boolean;
        connection_enabled: boolean;
        auth_type: 'none' | 'bearer';
        has_credentials: boolean;
      }>(
        `SELECT d.id, d.enabled, d.source_connection_id, d.connector, d.source_collection,
                c.enabled AS connection_enabled,
                c.auth_type,
                c.credentials_encrypted IS NOT NULL AS has_credentials
         FROM sync.definitions d
         JOIN sync.connections c
           ON c.tenant_id = d.tenant_id
          AND c.id = d.source_connection_id
         WHERE d.tenant_id = $1 AND d.id = $2
         FOR SHARE OF d, c`,
        [tenantId, definitionId],
      );

      const definition = result.rows[0];

      if (!definition) {
        throw new NotFoundException('Definición no encontrada');
      }

      if (!definition.enabled) {
        throw new ConflictException('La definición está deshabilitada');
      }

      if (!definition.connection_enabled) {
        throw new ConflictException('La conexión está deshabilitada');
      }

      if (definition.auth_type !== 'bearer' || !definition.has_credentials) {
        throw new BadRequestException(
          'La conexión académica requiere una credencial Bearer',
        );
      }

      const inserted = await client.query<SyncRun>(
        `INSERT INTO sync.runs
           (tenant_id, definition_id, request_key_hash, request_fingerprint,
            source_connection_id, connector, source_collection)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${publicColumns}`,
        [
          tenantId,
          definition.id,
          keyHash,
          fingerprint,
          definition.source_connection_id,
          definition.connector,
          definition.source_collection,
        ],
      );
      await client.query(
        'INSERT INTO sync.run_jobs (tenant_id, run_id) VALUES ($1, $2)',
        [tenantId, inserted.rows[0].id],
      );

      return inserted.rows[0];
    });
  }

  async get(tenantId: string, runId: string): Promise<SyncRun> {
    const result = await this.database.query<SyncRun>(
      `SELECT ${publicColumns} FROM sync.runs WHERE tenant_id = $1 AND id = $2`,
      [tenantId, runId],
    );
    if (!result.rows[0]) throw new NotFoundException('Ejecución no encontrada');
    return result.rows[0];
  }
}
