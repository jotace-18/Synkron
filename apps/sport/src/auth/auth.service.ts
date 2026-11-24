import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async authenticate(token: string, write = false): Promise<string> {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new UnauthorizedException('Credencial deportiva no válida');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const result = await this.database.query<{ id: string }>(
      `SELECT id
       FROM sport.accounts
       WHERE token_hash = $1 AND enabled = true
       UNION ALL
       SELECT a.id FROM sport.accounts a
       JOIN sport.connection_tokens t ON t.account_id=a.id
       WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND a.enabled=true AND $2=false`,
      [tokenHash, write],
    );

    const account = result.rows[0];

    if (!account) {
      throw new UnauthorizedException('Credencial deportiva no válida');
    }

    return account.id;
  }
}
