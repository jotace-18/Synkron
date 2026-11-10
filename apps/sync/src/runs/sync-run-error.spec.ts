import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseError } from 'pg';
import { toSafeRunError, type SyncRunErrorCode } from './sync-run-error';

describe('toSafeRunError', () => {
  const privateMessage =
    'PRIVATE password=secret Bearer private-token sql=private-table';
  const databaseError = new DatabaseError(privateMessage, 0, 'error');
  databaseError.code = '23505';
  databaseError.detail = privateMessage;
  databaseError.internalQuery = privateMessage;
  const classifiedErrors: [unknown, SyncRunErrorCode, string][] = [
    [
      new BadGatewayException(privateMessage),
      'source_error',
      'No se pudieron obtener datos válidos de la fuente.',
    ],
    [
      new ForbiddenException(privateMessage),
      'source_not_allowed',
      'El destino de la fuente no está autorizado.',
    ],
    [
      new NotFoundException(privateMessage),
      'resource_not_found',
      'No se encontró el recurso necesario para la ejecución.',
    ],
    [
      new ConflictException(privateMessage),
      'configuration_conflict',
      'La configuración actual no permite ejecutar la sincronización.',
    ],
    [
      new BadRequestException(privateMessage),
      'invalid_configuration',
      'La configuración de la sincronización no es válida.',
    ],
    [
      new UnprocessableEntityException(privateMessage),
      'invalid_configuration',
      'La configuración de la sincronización no es válida.',
    ],
    [
      new ServiceUnavailableException(privateMessage),
      'dependency_unavailable',
      'Una dependencia necesaria no está disponible.',
    ],
    [
      databaseError,
      'storage_error',
      'No se pudo guardar el resultado de la sincronización.',
    ],
  ];

  it.each(classifiedErrors)(
    'classifies a known error without copying its message: %s',
    (error, code, message) => {
      expect(toSafeRunError(error)).toEqual({ code, message });
      expect(JSON.stringify(toSafeRunError(error))).not.toContain('PRIVATE');
    },
  );

  it.each([
    new Error(privateMessage),
    privateMessage,
    null,
    undefined,
    123,
    { message: privateMessage, code: '23505', detail: privateMessage },
    new HttpException({ message: privateMessage, token: privateMessage }, 500),
  ])('returns a generic safe error for an unknown failure: %j', (error) => {
    expect(toSafeRunError(error)).toEqual({
      code: 'unknown_error',
      message: 'No se pudo completar la sincronización.',
    });
  });

  it.each(classifiedErrors)(
    'returns only a valid database code and a bounded message for %s',
    (error) => {
      const safe = toSafeRunError(error);
      expect(Object.keys(safe).sort()).toEqual(['code', 'message']);
      expect(safe.code).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
      expect(safe.message.trim().length).toBeGreaterThan(0);
      expect(safe.message.length).toBeLessThanOrEqual(500);
    },
  );

  it('does not inspect raw messages or response bodies while classifying an exception', () => {
    const error = new BadGatewayException(privateMessage);
    Object.defineProperty(error, 'message', {
      get() {
        throw new Error('Raw message must not be read');
      },
    });
    const response = jest.spyOn(error, 'getResponse').mockImplementation(() => {
      throw new Error('Response must not be read');
    });
    expect(toSafeRunError(error).code).toBe('source_error');
    expect(response).not.toHaveBeenCalled();
  });

  it('does not reuse a mutable result object across calls', () => {
    const first = toSafeRunError(new BadGatewayException(privateMessage));
    first.message = 'Caller modification';
    expect(
      toSafeRunError(new BadGatewayException(privateMessage)).message,
    ).toBe('No se pudieron obtener datos válidos de la fuente.');
  });

  it('does not truncate and publish an oversized internal error message', () => {
    const result = toSafeRunError(new Error(privateMessage.repeat(100)));
    expect(result.message).toBe('No se pudo completar la sincronización.');
  });
});
