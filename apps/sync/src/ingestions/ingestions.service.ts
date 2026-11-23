import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { canonicalJson } from '../activities/activity-content-hash';
import type { JsonValue } from '../activities/activity.types';
import type { SyncRun } from '../runs/run.types';
import { validateRunRequestKey } from '../runs/validate-run-request-key';
import { IngestionSourcesService } from './ingestion-sources.service';
import type { IngestionPrincipal } from './ingestion-source.types';
import type { IngestionReceipt, IngestionResult } from './ingestion.types';
import { parseIngestionRequest } from './parse-ingestion-request';
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
@Injectable()
export class IngestionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sources: IngestionSourcesService,
  ) {}
  async accept(
    principal: IngestionPrincipal,
    body: unknown,
    key: unknown,
  ): Promise<IngestionReceipt> {
    validateRunRequestKey(key);
    const keyHash = hash(JSON.stringify({ source: principal.source_id, key }));
    return this.database
      .transaction(async (client) => {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`ingestion:${principal.tenant_id}:${keyHash}`],
        );
        const source = await this.sources.lockCredential(client, principal);
        const operation = parseIngestionRequest(body, source);
        const fingerprint = hash(
          canonicalJson({
            schema_version: 1,
            operation: operation as unknown as JsonValue,
          }),
        );
        const existing = await client.query<
          IngestionReceipt & { request_fingerprint: string }
        >(
          `SELECT r.id,r.status,r.request_fingerprint
    FROM sync.runs r JOIN sync.ingestions i ON i.tenant_id=r.tenant_id AND i.run_id=r.id
    WHERE r.tenant_id=$1 AND r.request_key_hash=$2 AND i.source_id=$3`,
          [source.tenant_id, keyHash, source.source_id],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].request_fingerprint !== fingerprint)
            throw new ConflictException(
              'La clave de idempotencia ya se utilizó con otro contenido',
            );
          return { id: existing.rows[0].id, status: existing.rows[0].status };
        }
        if (
          !source.enabled ||
          !source.definition_enabled ||
          !source.connection_enabled
        )
          throw new ConflictException(
            'La fuente de entrada está deshabilitada',
          );
        const result = await client.query<IngestionReceipt>(
          `INSERT INTO sync.runs(tenant_id,definition_id,source_connection_id,connector,source_collection,request_key_hash,request_fingerprint)
    VALUES($1,$2,$3,'standard.ingestion',$4,$5,$6) RETURNING id,status`,
          [
            source.tenant_id,
            source.definition_id,
            source.source_connection_id,
            source.source_collection,
            keyHash,
            fingerprint,
          ],
        );
        const run = result.rows[0];
        await client.query(
          `INSERT INTO sync.ingestions(run_id,tenant_id,source_id,definition_id,operation,allowed_types)
    VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
          [
            run.id,
            source.tenant_id,
            source.source_id,
            source.definition_id,
            JSON.stringify(operation),
            source.allowed_types,
          ],
        );
        await client.query(
          'INSERT INTO sync.run_jobs(tenant_id,run_id) VALUES($1,$2)',
          [source.tenant_id, run.id],
        );
        return run;
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new ServiceUnavailableException(
          'No se pudo confirmar la recepción de la entrada; reintenta con la misma clave',
        );
      });
  }
  async get(
    principal: IngestionPrincipal,
    id: string,
  ): Promise<IngestionResult> {
    return this.database
      .transaction(async (client) => {
        const source = await this.sources.lockCredential(client, principal);
        const result = await client.query<SyncRun>(
          `SELECT r.* FROM sync.runs r JOIN sync.ingestions i ON i.tenant_id=r.tenant_id AND i.run_id=r.id
    WHERE r.tenant_id=$1 AND r.id=$2 AND i.source_id=$3`,
          [source.tenant_id, id, source.source_id],
        );
        const run = result.rows[0];
        if (!run) throw new NotFoundException('Entrada no encontrada');
        return {
          id: run.id,
          status: run.status,
          counts: {
            read: run.read_count,
            created: run.created_count,
            updated: run.updated_count,
            unchanged: run.unchanged_count,
            retired: run.retired_count,
            ignored: run.ignored_count,
          },
          error: run.error_code
            ? { code: run.error_code, message: run.error_message! }
            : null,
        };
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new ServiceUnavailableException(
          'No se pudo consultar el resultado de la entrada',
        );
      });
  }
}
