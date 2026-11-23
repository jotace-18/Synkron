import type { INestApplication } from '@nestjs/common';
import type { Response } from 'express';
import { generatePublicDocument } from './openapi-support';
import { buildAcademicOpenApi } from './openapi';

export function configureApiDocs(app: INestApplication): void {
  const document = generatePublicDocument(app, buildAcademicOpenApi());
  app
    .getHttpAdapter()
    .get('/api/docs/openapi.json', (_request: unknown, response: Response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.json(document);
    });
}
