import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseError } from 'pg';

const messages = {
  source_error: 'No se pudieron obtener datos válidos de la fuente.',
  source_not_allowed: 'El destino de la fuente no está autorizado.',
  resource_not_found: 'No se encontró el recurso necesario para la ejecución.',
  configuration_conflict:
    'La configuración actual no permite ejecutar la sincronización.',
  invalid_configuration: 'La configuración de la sincronización no es válida.',
  dependency_unavailable: 'Una dependencia necesaria no está disponible.',
  storage_error: 'No se pudo guardar el resultado de la sincronización.',
  unknown_error: 'No se pudo completar la sincronización.',
} as const;

export type SyncRunErrorCode = keyof typeof messages;

export interface SafeSyncRunError {
  code: SyncRunErrorCode;
  message: string;
}

export function toSafeRunError(error: unknown): SafeSyncRunError {
  let code: SyncRunErrorCode = 'unknown_error';

  if (error instanceof BadGatewayException) {
    code = 'source_error';
  } else if (error instanceof ForbiddenException) {
    code = 'source_not_allowed';
  } else if (error instanceof NotFoundException) {
    code = 'resource_not_found';
  } else if (error instanceof ConflictException) {
    code = 'configuration_conflict';
  } else if (
    error instanceof BadRequestException ||
    error instanceof UnprocessableEntityException
  ) {
    code = 'invalid_configuration';
  } else if (error instanceof ServiceUnavailableException) {
    code = 'dependency_unavailable';
  } else if (error instanceof DatabaseError) {
    code = 'storage_error';
  }

  return { code, message: messages[code] };
}
