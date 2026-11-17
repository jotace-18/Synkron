import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  createSyncCompletedEvent,
  createSyncFailedEvent,
} from '../events/create-sync-result-event';
import { appendOutboxEvent } from '../events/event-outbox';

import type {
  ClaimedSyncRun,
  SyncRun,
  SyncRunCounts,
  SyncRunDeliveryState,
} from './run.types';
import { validateRunRequestKey } from './validate-run-request-key';
import { toSafeRunError } from './sync-run-error';

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

  async claimQueued(
    tenantId: string,
    runId: string,
  ): Promise<ClaimedSyncRun | null> {
    const result = await this.database.query<ClaimedSyncRun>(
      `UPDATE sync.runs
     SET status = 'running',
         started_at = COALESCE(started_at, clock_timestamp()),
         claim_token = gen_random_uuid(),
         lease_expires_at = clock_timestamp() + interval '60 seconds'
     WHERE tenant_id = $1
       AND id = $2
       AND (
         status = 'queued'
         OR (
           status = 'running'
           AND lease_expires_at <= clock_timestamp()
         )
       )
       AND source_connection_id IS NOT NULL
       AND connector = 'academic.assignments'
       AND source_collection = 'assignments'
     RETURNING ${publicColumns},
               tenant_id, source_connection_id,
               connector, source_collection,
               claim_token, lease_expires_at`,
      [tenantId, runId],
    );

    return result.rows[0] ?? null;
  }

  async renewLease(
    tenantId: string,
    runId: string,
    claimToken: string,
  ): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      `UPDATE sync.runs
     SET lease_expires_at = clock_timestamp() + interval '60 seconds'
     WHERE tenant_id = $1
       AND id = $2
       AND status = 'running'
       AND claim_token = $3
       AND lease_expires_at > clock_timestamp()
     RETURNING id`,
      [tenantId, runId, claimToken],
    );

    return result.rows.length === 1;
  }

  async get(tenantId: string, runId: string): Promise<SyncRun> {
    const result = await this.database.query<SyncRun>(
      `SELECT ${publicColumns} FROM sync.runs WHERE tenant_id = $1 AND id = $2`,
      [tenantId, runId],
    );
    if (!result.rows[0]) throw new NotFoundException('Ejecución no encontrada');
    return result.rows[0];
  }

  async getDeliveryState(
    tenantId: string,
    runId: string,
  ): Promise<SyncRunDeliveryState | null> {
    const result = await this.database.query<SyncRunDeliveryState>(
      `SELECT status, lease_expires_at,
              COALESCE(
                source_connection_id IS NOT NULL
                AND connector = 'academic.assignments'
                AND source_collection = 'assignments',
                false
              ) AS source_supported
       FROM sync.runs
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, runId],
    );

    return result.rows[0] ?? null;
  }

  async complete(
    tenantId: string,
    runId: string,
    counts: SyncRunCounts,
    claimToken: string,
  ): Promise<SyncRun> {
    return this.database.transaction(async (client) => {
      const result = await client.query<SyncRun>(
        `UPDATE sync.runs
       SET status = 'completed',
           finished_at = clock_timestamp(),
           claim_token = NULL,
           lease_expires_at = NULL,
           read_count = $3,
           created_count = $4,
           updated_count = $5,
           unchanged_count = $6,
           retired_count = $7,
           ignored_count = $8
       WHERE tenant_id = $1
         AND id = $2
         AND status = 'running'
         AND claim_token = $9
         AND lease_expires_at > clock_timestamp()
       RETURNING ${publicColumns}`,
        [
          tenantId,
          runId,
          counts.read,
          counts.created,
          counts.updated,
          counts.unchanged,
          counts.retired,
          counts.ignored,
          claimToken,
        ],
      );

      const run = result.rows[0];

      if (!run) {
        throw new ConflictException('La ejecución no está en curso');
      }

      await appendOutboxEvent(
        client,
        createSyncCompletedEvent(tenantId, {
          sync_run_id: run.id,
          definition_id: run.definition_id,
          counts: {
            read: run.read_count,
            created: run.created_count,
            updated: run.updated_count,
            unchanged: run.unchanged_count,
            retired: run.retired_count,
            ignored: run.ignored_count,
          },
        }),
      );

      return run;
    });
  }

  async fail(
    tenantId: string,
    runId: string,
    counts: SyncRunCounts,
    error: unknown,
    claimToken: string,
  ): Promise<SyncRun> {
    const safeError = toSafeRunError(error);

    return this.database.transaction(async (client) => {
      const result = await client.query<SyncRun>(
        `UPDATE sync.runs
       SET status = 'failed',
           finished_at = clock_timestamp(),
           claim_token = NULL,
           lease_expires_at = NULL,
           read_count = $3,
           created_count = $4,
           updated_count = $5,
           unchanged_count = $6,
           retired_count = $7,
           ignored_count = $8,
           error_code = $9,
           error_message = $10
       WHERE tenant_id = $1
         AND id = $2
         AND status = 'running'
         AND claim_token = $11
         AND lease_expires_at > clock_timestamp()
       RETURNING ${publicColumns}`,
        [
          tenantId,
          runId,
          counts.read,
          counts.created,
          counts.updated,
          counts.unchanged,
          counts.retired,
          counts.ignored,
          safeError.code,
          safeError.message,
          claimToken,
        ],
      );

      const run = result.rows[0];

      if (!run) {
        throw new ConflictException('La ejecución no está en curso');
      }

      await appendOutboxEvent(
        client,
        createSyncFailedEvent(tenantId, {
          sync_run_id: run.id,
          definition_id: run.definition_id,
          counts: {
            read: run.read_count,
            created: run.created_count,
            updated: run.updated_count,
            unchanged: run.unchanged_count,
            retired: run.retired_count,
            ignored: run.ignored_count,
          },
          error: safeError,
        }),
      );

      return run;
    });
  }
}
