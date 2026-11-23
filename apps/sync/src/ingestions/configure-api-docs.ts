import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { buildSyncOpenApi } from '../docs/openapi';
import { generatePublicDocument } from '../docs/openapi-support';

export interface SwaggerRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
  credentials?: RequestCredentials;
  redirect?: RequestRedirect;
}

// Swagger serializes this function into its browser initializer. Keep it self-contained.
export async function swaggerRequestInterceptor(
  request: SwaggerRequest,
): Promise<SwaggerRequest> {
  const target = new URL(request.url, globalThis.location.origin);
  if (target.origin !== globalThis.location.origin) {
    throw new Error(
      'Las pruebas de Swagger deben utilizar el mismo origen de Synkron.',
    );
  }
  request.redirect = 'error';
  request.credentials =
    /^(?:\/api\/v1\/ingestions(?:\/|$)|\/(?:academic|sport|personal)\/api\/v1\/)/.test(
      target.pathname,
    )
      ? 'omit'
      : 'same-origin';

  if (
    target.pathname.startsWith('/api/v1/') &&
    !/^\/api\/v1\/ingestions(?:\/|$)/.test(target.pathname) &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
      (request.method ?? 'GET').toUpperCase(),
    )
  ) {
    const response = await fetch('/api/v1/auth/csrf', {
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(
        'No se pudo obtener CSRF. Inicia sesión en Synkron y repite la petición.',
      );
    }
    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('csrf_token' in payload) ||
      typeof payload.csrf_token !== 'string' ||
      !payload.csrf_token
    ) {
      throw new Error('No se recibió un token CSRF válido.');
    }
    request.headers['X-CSRF-Token'] = payload.csrf_token;
  }
  return request;
}

export function configureApiDocs(app: INestApplication): void {
  app.use(
    '/api/docs',
    (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      );
      next();
    },
  );
  SwaggerModule.setup(
    'api/docs',
    app,
    () => generatePublicDocument(app, buildSyncOpenApi()),
    {
      explorer: true,
      jsonDocumentUrl: 'api/docs/openapi.json',
      raw: ['json'],
      customSiteTitle: 'Synkron · Swagger UI',
      swaggerOptions: {
        urls: [
          { name: 'Sync', url: '/api/docs/openapi.json' },
          {
            name: 'Cuentas y sesiones',
            url: '/api/docs/accounts/openapi.json',
          },
          { name: 'Automation', url: '/api/docs/automation/openapi.json' },
          { name: 'Monitoring', url: '/api/docs/monitoring/openapi.json' },
          {
            name: 'Otros · fuente externa',
            url: '/api/docs/personal/openapi.json',
          },
          {
            name: 'Deporte · fuente externa',
            url: '/api/docs/sport/openapi.json',
          },
          {
            name: 'Academic · fuente externa',
            url: '/api/docs/academic/openapi.json',
          },
        ],
        'urls.primaryName': 'Sync',
        persistAuthorization: false,
        withCredentials: true,
        queryConfigEnabled: false,
        validatorUrl: null,
        filter: true,
        docExpansion: 'list',
        requestInterceptor: swaggerRequestInterceptor,
      },
    },
  );
}
