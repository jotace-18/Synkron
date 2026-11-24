import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { digest, hashPassword, verifyPassword } from './identity-crypto';

const schema = 'personal';
const cookieName = `synkron_${schema}_session`;
const csrfCookieName = `synkron_${schema}_csrf`;
export interface SourceAccount {
  id: string;
  email: string;
}
function readCookie(request: Request, name: string): string | undefined {
  const matches = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : undefined;
}
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.SOURCE_COOKIE_SECURE === 'true',
    path: '/',
  } as const;
}
function equal(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
@Injectable()
export class SourceIdentityService {
  constructor(private readonly database: DatabaseService) {}
  private csrfSignature(request: Request, nonce: string): string {
    const secret = process.env.CSRF_SECRET;
    if (!secret || secret.length < 64)
      throw new Error('CSRF_SECRET debe contener al menos 64 caracteres');
    return createHmac('sha256', secret)
      .update(`${schema}:${readCookie(request, cookieName) ?? ''}:${nonce}`)
      .digest('hex');
  }
  issueCsrf(request: Request, response: Response) {
    const nonce = randomBytes(32).toString('hex');
    const token = `${nonce}.${this.csrfSignature(request, nonce)}`;
    response.cookie(csrfCookieName, token, {
      ...cookieOptions(),
      maxAge: 60 * 60 * 1000,
    });
    return { csrf_token: token };
  }
  checkWrite(request: Request): void {
    const allowed = (process.env.SOURCE_APP_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!request.headers.origin || !allowed.includes(request.headers.origin))
      throw new ForbiddenException('Origen no permitido');
    const cookie = readCookie(request, csrfCookieName);
    const header = request.headers['x-csrf-token'];
    const match = /^([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(cookie ?? '');
    if (
      typeof header !== 'string' ||
      !cookie ||
      !match ||
      !equal(header, cookie) ||
      !equal(match[2], this.csrfSignature(request, match[1]))
    )
      throw new ForbiddenException('Token CSRF no válido');
  }
  private async limit(key: string, maximum: number) {
    const result = await this.database.query<{ attempts: number }>(
      `INSERT INTO personal.identity_rate_limits(key) VALUES($1)
      ON CONFLICT(key) DO UPDATE SET
        attempts = CASE WHEN identity_rate_limits.window_start < now() - interval '15 minutes' THEN 1 ELSE identity_rate_limits.attempts + 1 END,
        window_start = CASE WHEN identity_rate_limits.window_start < now() - interval '15 minutes' THEN now() ELSE identity_rate_limits.window_start END
      RETURNING attempts`,
      [digest(key)],
    );
    if (result.rows[0].attempts > maximum)
      throw new HttpException('Demasiados intentos; espera 15 minutos.', 429);
  }
  async register(
    email: string,
    password: string,
    request: Request,
  ): Promise<SourceAccount> {
    await this.limit(`register:${request.ip ?? 'unknown'}`, 20);
    const normalized = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);
    try {
      const result = await this.database.query<SourceAccount>(
        `INSERT INTO personal.accounts(name,email,password_hash,token_hash)
        VALUES($1,$2,$3,$4) RETURNING id,email`,
        [
          normalized.slice(0, 100),
          normalized,
          passwordHash,
          digest(randomBytes(32).toString('hex')),
        ],
      );
      return result.rows[0];
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      )
        throw new ConflictException('El correo ya está registrado');
      throw error;
    }
  }
  async login(
    email: string,
    password: string,
    request: Request,
    response: Response,
  ): Promise<SourceAccount> {
    const normalized = email.trim().toLowerCase();
    await this.limit(`login-ip:${request.ip ?? 'unknown'}`, 100);
    await this.limit(`login-email:${normalized}`, 5);
    const found = await this.database.query<
      SourceAccount & { password_hash: string }
    >(
      'SELECT id,email,password_hash FROM personal.accounts WHERE email=$1 AND enabled=true',
      [normalized],
    );
    const account = found.rows[0];
    const valid = await verifyPassword(password, account?.password_hash);
    if (!account || !valid)
      throw new UnauthorizedException('Correo o contraseña no válidos');
    const token = randomBytes(32).toString('hex');
    await this.database.query(
      `WITH previous AS (DELETE FROM personal.browser_sessions WHERE token_hash=$1)
      INSERT INTO personal.browser_sessions(token_hash,account_id) VALUES($2,$3)`,
      [
        digest(readCookie(request, cookieName) ?? ''),
        digest(token),
        account.id,
      ],
    );
    await this.database.query(
      'DELETE FROM personal.identity_rate_limits WHERE key=$1',
      [digest(`login-email:${normalized}`)],
    );
    response.cookie(cookieName, token, {
      ...cookieOptions(),
      maxAge: 12 * 60 * 60 * 1000,
    });
    return { id: account.id, email: account.email };
  }
  async session(request: Request): Promise<SourceAccount> {
    const token = readCookie(request, cookieName);
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Inicia sesión');
    const result = await this.database.query<SourceAccount>(
      `UPDATE personal.browser_sessions AS s SET last_seen_at=now()
      FROM personal.accounts AS a WHERE s.account_id=a.id AND a.enabled=true AND s.token_hash=$1
      AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 minutes' RETURNING a.id,a.email`,
      [digest(token)],
    );
    if (!result.rows[0])
      throw new UnauthorizedException('La sesión ha caducado');
    return result.rows[0];
  }
  async logout(request: Request, response: Response) {
    await this.database.query(
      'DELETE FROM personal.browser_sessions WHERE token_hash=$1',
      [digest(readCookie(request, cookieName) ?? '')],
    );
    response.clearCookie(cookieName, cookieOptions());
    response.clearCookie(csrfCookieName, cookieOptions());
  }
  async listTokens(accountId: string) {
    return (
      await this.database.query(
        `SELECT id,name,suffix,created_at,revoked_at FROM personal.connection_tokens WHERE account_id=$1 ORDER BY created_at DESC,id DESC`,
        [accountId],
      )
    ).rows as {
      id: string;
      name: string;
      suffix: string;
      created_at: Date;
      revoked_at: Date | null;
    }[];
  }
  async createToken(accountId: string, name: string) {
    const token = randomBytes(32).toString('hex');
    const result = await this.database.query<{
      id: string;
      name: string;
      suffix: string;
      created_at: Date;
    }>(
      `INSERT INTO personal.connection_tokens(account_id,name,token_hash,suffix)
      VALUES($1,$2,$3,$4) RETURNING id,name,suffix,created_at`,
      [accountId, name.trim(), digest(token), token.slice(-4)],
    );
    return { ...result.rows[0], token };
  }
  async revokeToken(accountId: string, id: string) {
    const result = await this.database.query(
      `UPDATE personal.connection_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND account_id=$2 RETURNING id`,
      [id, accountId],
    );
    if (!result.rows.length)
      throw new NotFoundException('Credencial no encontrada');
  }
}
