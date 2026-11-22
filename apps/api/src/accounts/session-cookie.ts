import type { Request } from 'express';

export function sessionCookieName(): string {
  const name = process.env.SESSION_COOKIE_NAME ?? '__Host-synkron_session';

  if (!/^__Host-[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('SESSION_COOKIE_NAME debe usar el prefijo __Host-');
  }

  return name;
}

export function readSessionToken(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[sessionCookieName()];

  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
    ? token
    : undefined;
}
