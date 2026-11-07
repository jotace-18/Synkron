import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { AccountsService } from './accounts.service';
import { DatabaseService } from '../database/database.service';
import { readSessionToken, sessionCookieName } from './session-cookie';

export type SessionView = {
  user: { id: string; email: string };
  expires_at: Date;
};

export class LoginRateLimitException extends HttpException {
  constructor(readonly retryAfter: number) {
    super('Demasiados intentos de acceso', HttpStatus.TOO_MANY_REQUESTS);
  }
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return value;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const cookieOptions = {
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
} as const;

@Injectable()
export class AuthService {
  private readonly cookieName = sessionCookieName();
  private readonly idleMinutes = positiveInteger(
    'SESSION_IDLE_TTL_MINUTES',
    30,
  );
  private readonly absoluteHours = positiveInteger(
    'SESSION_ABSOLUTE_TTL_HOURS',
    12,
  );
  private readonly accountAttempts = positiveInteger(
    'AUTH_LOGIN_MAX_ATTEMPTS_PER_ACCOUNT',
    5,
  );
  private readonly ipAttempts = positiveInteger(
    'AUTH_LOGIN_MAX_ATTEMPTS_PER_IP',
    30,
  );
  private readonly windowMinutes = positiveInteger(
    'AUTH_LOGIN_WINDOW_MINUTES',
    15,
  );

  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
  ) {}

  async login(
    email: string,
    password: string,
    request: Request,
    response: Response,
  ): Promise<SessionView> {
    const normalizedEmail = email.trim().toLowerCase();
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    await this.recordLoginAttempt(normalizedEmail, ip);
    const account = await this.accounts.authenticate(normalizedEmail, password);
    const token = randomBytes(32).toString('hex');
    const previousToken = readSessionToken(request);

    const result = await this.database.query<{
      expires_at: Date;
      absolute_expires_at: Date;
    }>(
      `WITH revoked AS (
         UPDATE auth.sessions SET revoked_at = now()
         WHERE token_hash = $1 AND revoked_at IS NULL
       )
       INSERT INTO auth.sessions (user_id, token_hash, absolute_expires_at)
       VALUES ($2, $3, now() + $4 * interval '1 hour')
       RETURNING absolute_expires_at,
         LEAST(absolute_expires_at,
               last_seen_at + $5 * interval '1 minute') AS expires_at`,
      [
        previousToken ? digest(previousToken) : null,
        account.id,
        digest(token),
        this.absoluteHours,
        this.idleMinutes,
      ],
    );

    const session = result.rows[0];
    response.cookie(this.cookieName, token, {
      ...cookieOptions,
      expires: session.absolute_expires_at,
    });
    const cookies = request.cookies as Record<string, unknown>;
    cookies[this.cookieName] = token;

    return {
      user: { id: account.id, email: account.email },
      expires_at: session.expires_at,
    };
  }

  async getSession(request: Request): Promise<SessionView> {
    const token = readSessionToken(request);
    if (!token) throw new UnauthorizedException('Sesión no válida');

    const result = await this.database.query<{
      id: string;
      email: string;
      expires_at: Date;
    }>(
      `UPDATE auth.sessions AS s
       SET last_seen_at = GREATEST(s.last_seen_at, now())
       FROM auth.users AS u
       WHERE s.token_hash = $1 AND s.user_id = u.id
         AND s.revoked_at IS NULL AND s.absolute_expires_at > now()
         AND s.last_seen_at > now() - $2 * interval '1 minute'
       RETURNING u.id, u.email,
         LEAST(s.absolute_expires_at,
               s.last_seen_at + $2 * interval '1 minute') AS expires_at`,
      [digest(token), this.idleMinutes],
    );

    const session = result.rows[0];
    if (!session) throw new UnauthorizedException('Sesión no válida');

    return {
      user: { id: session.id, email: session.email },
      expires_at: session.expires_at,
    };
  }

  async logout(request: Request, response: Response): Promise<void> {
    const token = readSessionToken(request);
    if (token) {
      await this.database.query(
        `UPDATE auth.sessions SET revoked_at = COALESCE(revoked_at, now())
         WHERE token_hash = $1`,
        [digest(token)],
      );
    }

    response.clearCookie(this.cookieName, cookieOptions);
    const cookies = request.cookies as Record<string, unknown>;
    delete cookies[this.cookieName];
  }

  private async recordLoginAttempt(email: string, ip: string): Promise<void> {
    await this.database.query(
      'DELETE FROM auth.login_attempts WHERE expires_at <= now()',
    );

    const result = await this.database.query<{ retry_after: number | null }>(
      `WITH recorded AS (
         INSERT INTO auth.login_attempts AS a (bucket, attempts, expires_at)
         VALUES ($1, 1, now() + $3 * interval '1 minute'),
                ($2, 1, now() + $3 * interval '1 minute')
         ON CONFLICT (bucket) DO UPDATE SET
           attempts = CASE WHEN a.expires_at <= now() THEN 1 ELSE a.attempts + 1 END,
           expires_at = CASE WHEN a.expires_at <= now()
             THEN EXCLUDED.expires_at ELSE a.expires_at END
         RETURNING bucket, attempts, expires_at
       )
       SELECT max(ceil(extract(epoch FROM (expires_at - now()))))::int AS retry_after
       FROM recorded
       WHERE (bucket = $1 AND attempts > $4)
          OR (bucket = $2 AND attempts > $5)`,
      [
        `account:${digest(email)}`,
        `ip:${digest(ip)}`,
        this.windowMinutes,
        this.accountAttempts,
        this.ipAttempts,
      ],
    );

    const retryAfter = result.rows[0].retry_after;
    if (retryAfter !== null) {
      throw new LoginRateLimitException(Math.max(1, retryAfter));
    }
  }
}
