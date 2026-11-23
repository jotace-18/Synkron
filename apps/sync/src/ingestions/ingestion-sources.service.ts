import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { getActivitySchema } from '../activities/activity-schema';
import type { CreateIngestionSourceDto } from './dto/create-ingestion-source.dto';
import type {
  IngestionPrincipal,
  IngestionSourceView,
} from './ingestion-source.types';

export const sourceViewColumns = `s.id,d.name,d.source_connection_id,s.definition_id,d.source_collection,
 s.allowed_types,s.enabled,(s.revoked_at IS NOT NULL) AS revoked,s.created_at,s.updated_at`;
const principalColumns = `s.id AS source_id,s.tenant_id,s.definition_id,s.token_hash,s.allowed_types,s.enabled,
 d.source_connection_id,d.source_collection,d.enabled AS definition_enabled,c.enabled AS connection_enabled`;
const sourceJoins = `FROM sync.ingestion_sources s
 JOIN sync.definitions d ON d.tenant_id=s.tenant_id AND d.id=s.definition_id
 JOIN sync.connections c ON c.tenant_id=d.tenant_id AND c.id=d.source_connection_id`;
export function hashIngestionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
function newToken(): string {
  return `si_${randomBytes(32).toString('hex')}`;
}

@Injectable()
export class IngestionSourcesService {
  constructor(private readonly database: DatabaseService) {}

  async list(
    tenantId: string,
    limit = 20,
    offset = 0,
  ): Promise<IngestionSourceView[]> {
    const result = await this.database.query<IngestionSourceView>(
      `SELECT ${sourceViewColumns} ${sourceJoins}
   WHERE s.tenant_id=$1 ORDER BY s.created_at DESC,s.id DESC LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    );
    return result.rows;
  }
  async create(
    tenantId: string,
    input: CreateIngestionSourceDto,
  ): Promise<{ source: IngestionSourceView; token: string }> {
    if (input.allowed_types.some((type) => !getActivitySchema(type)))
      throw new UnprocessableEntityException(
        'Algún tipo aún no tiene un esquema habilitado',
      );
    const token = newToken();
    const source = await this.database.transaction(async (client) => {
      const connection = await client.query<{ id: string }>(
        `INSERT INTO sync.connections(tenant_id,name,base_url,auth_type,input_mode)
    VALUES($1,$2,NULL,'none','push') RETURNING id`,
        [tenantId, input.name],
      );
      const definition = await client.query<{ id: string }>(
        `INSERT INTO sync.definitions(tenant_id,source_connection_id,name,connector,source_collection,source_mode)
    VALUES($1,$2,$3,'standard.ingestion',$4,'push') RETURNING id`,
        [tenantId, connection.rows[0].id, input.name, input.source_collection],
      );
      const created = await client.query<{ id: string }>(
        `INSERT INTO sync.ingestion_sources(tenant_id,definition_id,token_hash,allowed_types)
    VALUES($1,$2,$3,$4) RETURNING id`,
        [
          tenantId,
          definition.rows[0].id,
          hashIngestionToken(token),
          input.allowed_types,
        ],
      );
      const view = await client.query<IngestionSourceView>(
        `SELECT ${sourceViewColumns} ${sourceJoins} WHERE s.tenant_id=$1 AND s.id=$2`,
        [tenantId, created.rows[0].id],
      );
      return view.rows[0];
    });
    return { source, token };
  }
  async setEnabled(
    tenantId: string,
    id: string,
    enabled: boolean,
  ): Promise<IngestionSourceView> {
    return this.change(
      tenantId,
      id,
      `enabled=$3,updated_at=CASE WHEN enabled IS DISTINCT FROM $3 THEN clock_timestamp() ELSE updated_at END`,
      [enabled],
    );
  }
  async revoke(tenantId: string, id: string): Promise<IngestionSourceView> {
    return this.change(
      tenantId,
      id,
      `revoked_at=COALESCE(revoked_at,clock_timestamp()),updated_at=CASE WHEN revoked_at IS NULL THEN clock_timestamp() ELSE updated_at END`,
      [],
    );
  }
  async rotate(
    tenantId: string,
    id: string,
  ): Promise<{ source: IngestionSourceView; token: string }> {
    const token = newToken();
    const source = await this.change(
      tenantId,
      id,
      `token_hash=$3,revoked_at=NULL,updated_at=clock_timestamp()`,
      [hashIngestionToken(token)],
    );
    return { source, token };
  }
  private async change(
    tenantId: string,
    id: string,
    set: string,
    extra: unknown[],
  ): Promise<IngestionSourceView> {
    return this.database.transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `UPDATE sync.ingestion_sources SET ${set} WHERE tenant_id=$1 AND id=$2 RETURNING id`,
        [tenantId, id, ...extra],
      );
      if (!result.rows[0]) throw new NotFoundException('Fuente no encontrada');
      const view = await client.query<IngestionSourceView>(
        `SELECT ${sourceViewColumns} ${sourceJoins} WHERE s.tenant_id=$1 AND s.id=$2`,
        [tenantId, id],
      );
      return view.rows[0];
    });
  }
  async authenticate(header: string | undefined): Promise<IngestionPrincipal> {
    const match = header && /^Bearer (si_[a-f0-9]{64})$/i.exec(header);
    if (!match)
      throw new UnauthorizedException('Credencial de entrada no válida');
    const result = await this.database
      .query<IngestionPrincipal>(
        `SELECT ${principalColumns} ${sourceJoins}
   WHERE s.token_hash=$1 AND s.revoked_at IS NULL`,
        [hashIngestionToken(match[1])],
      )
      .catch(() => {
        throw new ServiceUnavailableException(
          'No se pudo comprobar la fuente de entrada',
        );
      });
    if (!result.rows[0])
      throw new UnauthorizedException('Credencial de entrada no válida');
    return result.rows[0];
  }
  async lockCredential(
    client: PoolClient,
    principal: IngestionPrincipal,
  ): Promise<IngestionPrincipal> {
    const result = await client.query<IngestionPrincipal>(
      `SELECT ${principalColumns} ${sourceJoins}
   WHERE s.tenant_id=$1 AND s.id=$2 AND s.token_hash=$3 AND s.revoked_at IS NULL FOR SHARE OF s,d,c`,
      [principal.tenant_id, principal.source_id, principal.token_hash],
    );
    if (!result.rows[0])
      throw new UnauthorizedException('Credencial de entrada no válida');
    return result.rows[0];
  }
}
