import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DatabaseError } from 'pg';
import { DatabaseService } from '../database/database.service';

export type Account = {
  id: string;
  email: string;
  created_at: Date;
};

@Injectable()
export class AccountsService {
  constructor(private readonly database: DatabaseService) {}

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
