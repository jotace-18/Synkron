import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type ConnectionSummary = {
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
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string): Promise<ConnectionSummary[]> {
    const result = await this.database.query<ConnectionSummary>(
      `SELECT id, name, base_url, auth_type,
              credentials_encrypted IS NOT NULL AS has_credentials,
              enabled, created_at, updated_at
       FROM sync.connections
       WHERE tenant_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [tenantId],
    );

    return result.rows;
  }
}
