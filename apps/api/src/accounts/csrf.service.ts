import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { doubleCsrf, type DoubleCsrfUtilities } from 'csrf-csrf';
import type { Request, Response } from 'express';

const CONTEXT_COOKIE = '__Host-synkron_context';

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

@Injectable()
export class CsrfService {
  private readonly csrf: DoubleCsrfUtilities;

  constructor() {
    const secret = process.env.CSRF_SECRET;

    if (!secret || secret.length < 64) {
      throw new Error('CSRF_SECRET debe contener al menos 64 caracteres');
    }

    this.csrf = doubleCsrf({
      getSecret: () => secret,
      getSessionIdentifier: (request) => this.readContext(request),
      cookieName: '__Host-synkron_csrf',
      cookieOptions,
      getCsrfTokenFromRequest: (request) => request.get('X-CSRF-Token'),
    });
  }

  issueToken(request: Request, response: Response): string {
    const context = randomBytes(32).toString('hex');
    const cookies = request.cookies as Record<string, unknown>;

    cookies[CONTEXT_COOKIE] = context;
    response.cookie(CONTEXT_COOKIE, context, cookieOptions);

    return this.csrf.generateCsrfToken(request, response, {
      overwrite: true,
    });
  }

  validateToken(request: Request): boolean {
    return (
      this.readContext(request) !== '' && this.csrf.validateRequest(request)
    );
  }

  private readContext(request: Request): string {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const context = cookies?.[CONTEXT_COOKIE];

    return typeof context === 'string' && /^[a-f0-9]{64}$/.test(context)
      ? context
      : '';
  }
}
