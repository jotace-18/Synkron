import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export type VerifiedSession = {
  tenant_id: string;
  expires_at: string;
};

const uuidPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

@Injectable()
export class SessionClientService {
  getSession(cookieHeader?: string): Promise<VerifiedSession> {
    return this.verifySession(cookieHeader);
  }

  authorizeWrite(
    cookieHeader?: string,
    origin?: string,
    csrfToken?: string,
  ): Promise<VerifiedSession> {
    return this.verifySession(cookieHeader, { origin, csrfToken });
  }

  private async verifySession(
    cookieHeader?: string,
    write?: { origin?: string; csrfToken?: string },
  ): Promise<VerifiedSession> {
    const cookieName =
      process.env.SESSION_COOKIE_NAME ?? '__Host-synkron_session';
    const prefix = `${cookieName}=`;
    const cookies = (cookieHeader ?? '')
      .split(';')
      .map((cookie) => cookie.trim());
    const matches = cookies.filter((cookie) => cookie.startsWith(prefix));

    if (
      matches.length !== 1 ||
      !/^[a-f0-9]{64}$/.test(matches[0].slice(prefix.length))
    ) {
      throw new UnauthorizedException('Sesión no válida');
    }

    if (write && (!write.origin || !write.csrfToken)) {
      throw new ForbiddenException('Origen o token CSRF ausente');
    }

    try {
      const baseUrl = process.env.AUTH_API_INTERNAL_URL;
      const serviceToken = process.env.SYNC_AUTH_SERVICE_TOKEN;
      if (
        !baseUrl ||
        !serviceToken ||
        !/^[a-f0-9]{64}$/.test(serviceToken) ||
        !/^__Host-[a-zA-Z0-9_-]+$/.test(cookieName)
      ) {
        throw new Error('Configuración interna inválida');
      }

      const url = new URL('/internal/auth/session', baseUrl);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error('Dirección interna inválida');
      }

      const allowedCookies = new Set([
        cookieName,
        '__Host-synkron_context',
        '__Host-synkron_csrf',
      ]);
      const headers: Record<string, string> = {
        Cookie: write
          ? cookies
              .filter((cookie) =>
                allowedCookies.has(cookie.slice(0, cookie.indexOf('='))),
              )
              .join('; ')
          : matches[0],
        'X-Synkron-Service-Token': serviceToken,
      };
      if (write) {
        headers.Origin = write.origin ?? '';
        headers['X-CSRF-Token'] = write.csrfToken ?? '';
      }

      const response = await fetch(url, {
        method: write ? 'POST' : 'GET',
        headers,
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      });

      if (response.status === 401) {
        throw new UnauthorizedException('Sesión no válida');
      }
      if (write && response.status === 403) {
        throw new ForbiddenException('Operación no autorizada');
      }
      if (response.status !== 200) {
        throw new Error('Respuesta interna inesperada');
      }

      const body: unknown = await response.json();
      if (
        typeof body !== 'object' ||
        body === null ||
        !('tenant_id' in body) ||
        typeof body.tenant_id !== 'string' ||
        !uuidPattern.test(body.tenant_id) ||
        !('expires_at' in body) ||
        typeof body.expires_at !== 'string' ||
        !(Date.parse(body.expires_at) > Date.now())
      ) {
        throw new Error('Respuesta interna inválida');
      }

      return { tenant_id: body.tenant_id, expires_at: body.expires_at };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException('No se pudo comprobar la sesión');
    }
  }
}
