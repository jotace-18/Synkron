import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { DatabaseError } from 'pg';
import { DatabaseService } from '../database/database.service';

export type Account = {
  id: string;
  email: string;
  created_at: Date;
};

// Hash de una contraseña ficticia para comprobar también los correos inexistentes.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$UgvQdrtU1GDD58i99HjQwA$MMF8nlVQKLPAF0dkMMSmjZKkRO6pFhumkEXTpG6Zbrc';

@Injectable()
export class AccountsService {
  constructor(private readonly database: DatabaseService) {}

  async authenticate(email: string, password: string): Promise<Account> {
    const result = await this.database.query<
      Account & { password_hash: string }
    >(
      'SELECT id, email, password_hash, created_at FROM auth.users WHERE email = $1',
      [email.trim().toLowerCase()],
    );
    const account = result.rows[0];
    const valid = await argon2.verify(
      account?.password_hash ?? DUMMY_PASSWORD_HASH,
      password,
    );

    if (!account || !valid) {
      throw new UnauthorizedException('Credenciales no válidas');
    }

    return {
      id: account.id,
      email: account.email,
      created_at: account.created_at,
    };
  }

  async register(email: string, password: string): Promise<Account> {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    try {
      const result = await this.database.query<Account>(
        `INSERT INTO auth.users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, created_at`,
        [normalizedEmail, passwordHash],
      );

      return result.rows[0];
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        error.code === '23505' &&
        error.constraint === 'users_email_key'
      ) {
        throw new ConflictException('El correo ya está registrado');
      }

      throw error;
    }
  }
}
