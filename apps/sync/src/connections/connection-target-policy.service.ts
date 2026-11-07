import { ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class ConnectionTargetPolicyService {
  private readonly allowedOrigins = new Set<string>();

  constructor() {
    const entries = (process.env.SYNC_ALLOWED_CONNECTION_ORIGINS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of entries) {
      let url: URL;

      try {
        url = new URL(entry);
      } catch {
        throw new Error('SYNC_ALLOWED_CONNECTION_ORIGINS inválido');
      }

      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      ) {
        throw new Error('SYNC_ALLOWED_CONNECTION_ORIGINS inválido');
      }

      this.allowedOrigins.add(url.origin);
    }
  }

  assertAllowed(value: string): URL {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new ForbiddenException('Destino no autorizado');
    }

    if (
      !this.allowedOrigins.has(url.origin) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new ForbiddenException('Destino no autorizado');
    }

    return url;
  }
}
