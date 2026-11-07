import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CredentialsService } from '../credentials/credentials.service';
import { DatabaseService } from '../database/database.service';
import {
  ConnectionProbeService,
  type ConnectionProbeResult,
} from './connection-probe.service';

export type ConnectionSummary = {
  id: string;
  name: string;
  base_url: string;
  auth_type: 'none' | 'bearer';
  has_credentials: boolean;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentials: CredentialsService,
    private readonly probe: ConnectionProbeService,
  ) {}

  async list(
    tenantId: string,
    limit = 20,
    offset = 0,
  ): Promise<ConnectionSummary[]> {
    const result = await this.database.query<ConnectionSummary>(
      `SELECT id, name, base_url, auth_type,
              credentials_encrypted IS NOT NULL AS has_credentials,
              enabled, created_at, updated_at
       FROM sync.connections
       WHERE tenant_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    );

    return result.rows;
  }

  async testConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<ConnectionProbeResult> {
    const result = await this.database.query<{
      id: string;
      base_url: string;
      auth_type: 'none' | 'bearer';
      credentials_encrypted: string | null;
    }>(
      `SELECT id, base_url, auth_type, credentials_encrypted
       FROM sync.connections
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, connectionId],
    );

    const connection = result.rows[0];
    if (!connection) {
      throw new NotFoundException('Conexión no encontrada');
    }

    let token: string | undefined;
    if (connection.auth_type === 'bearer') {
      if (!connection.credentials_encrypted) {
        throw new ServiceUnavailableException(
          'No se pudo recuperar la credencial',
        );
      }

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
    }

    return this.probe.probe(connection.base_url, token);
  }

  async createWithoutAuth(
    tenantId: string,
    input: {
      name: string;
      base_url: string;
      enabled?: boolean;
    },
  ): Promise<ConnectionSummary> {
    const result = await this.database.query<ConnectionSummary>(
      `INSERT INTO sync.connections
         (tenant_id, name, base_url, auth_type, enabled)
       VALUES ($1, $2, $3, 'none', $4)
       RETURNING id, name, base_url, auth_type,
                 credentials_encrypted IS NOT NULL AS has_credentials,
                 enabled, created_at, updated_at`,
      [tenantId, input.name.trim(), input.base_url, input.enabled ?? true],
    );

    return result.rows[0];
  }

  async createWithBearer(
    tenantId: string,
    input: {
      name: string;
      base_url: string;
      token: string;
      enabled?: boolean;
    },
  ): Promise<ConnectionSummary> {
    const id = randomUUID();
    const encrypted = this.credentials.encrypt(input.token, tenantId, id);

    const result = await this.database.query<ConnectionSummary>(
      `INSERT INTO sync.connections
         (id, tenant_id, name, base_url, auth_type,
          credentials_encrypted, enabled)
       VALUES ($1, $2, $3, $4, 'bearer', $5, $6)
       RETURNING id, name, base_url, auth_type,
                 credentials_encrypted IS NOT NULL AS has_credentials,
                 enabled, created_at, updated_at`,
      [
        id,
        tenantId,
        input.name.trim(),
        input.base_url,
        encrypted,
        input.enabled ?? true,
      ],
    );

    return result.rows[0];
  }
}
