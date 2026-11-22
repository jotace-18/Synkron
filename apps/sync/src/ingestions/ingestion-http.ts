import type { INestApplication } from '@nestjs/common';
import { json } from 'express';
import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from 'express';
import { isRecord } from '../validation/value-validators';
export function configureIngestionHttp(app: INestApplication): void {
  const parser = json({ limit: '64kb', inflate: false, strict: false });
  app.use(
    '/api/v1/ingestions',
    function ingestionJson(
      request: Request,
      response: Response,
      next: NextFunction,
    ) {
      if (request.method !== 'POST') return next();
      const encoding = request.get('Content-Encoding');
      if (
        (encoding && encoding.toLowerCase() !== 'identity') ||
        !/^application\/json(?:\s*;.*)?$/i.test(
          request.get('Content-Type') ?? '',
        )
      ) {
        response
          .status(415)
          .json({ statusCode: 415, message: 'Se requiere JSON sin comprimir' });
        return;
      }
      // Keep a distinct middleware name so Nest still installs its parser for other routes.
      parser(request, response, next);
    },
  );
  const errors: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    next,
  ) => {
    const status = isRecord(error) ? error.status : undefined;
    if (status === 400 || status === 413 || status === 415) {
      const messages = {
        400: 'JSON mal formado',
        413: 'El cuerpo supera el límite de 64 KiB',
        415: 'Formato o codificación no admitidos',
      };
      response
        .status(status)
        .json({ statusCode: status, message: messages[status] });
      return;
    }
    next(error);
  };
  app.use('/api/v1/ingestions', errors);
}
