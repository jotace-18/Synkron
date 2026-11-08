import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async authenticate(token: string): Promise<string> {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new UnauthorizedException('Credencial académica no válida');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const result = await this.database.query<{ id: string }>(
      `SELECT id
       FROM academic.accounts
       WHERE token_hash = $1 AND enabled = true`,
      [tokenHash],
    );

    const account = result.rows[0];

    if (!account) {
      throw new UnauthorizedException('Credencial académica no válida');
    }

    return account.id;
  }
}
