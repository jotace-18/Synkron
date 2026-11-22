import { UnprocessableEntityException } from '@nestjs/common';
import type { ActivityImport } from '../activities/activity.types';
import {
  ActivityValidationError,
  normalizeActivityImport,
} from '../imports/activity-import.validation';
import type { ActivityImportContext } from '../imports/activity-import.validation';
import { hasExactFields, isRecord } from '../validation/value-validators';

function invalid(path: string, message: string): never {
  throw new UnprocessableEntityException({
    statusCode: 422,
    message: 'La entrada no cumple el contrato',
    errors: [{ path, message }],
  });
}

export function parseIngestionRequest(
  value: unknown,
  context: ActivityImportContext,
): ActivityImport {
  if (!isRecord(value)) {
    invalid('body', 'El cuerpo debe ser un objeto');
  }

  if (value.schema_version !== 1) {
    invalid('schema_version', 'La versión admitida es el número 1');
  }

  let operation: unknown;

  if (value.action === 'upsert') {
    if (
      !hasExactFields(value, [
        'schema_version',
        'action',
        'external_id',
        'source_updated_at',
        'activity',
      ])
    ) {
      invalid('body', 'Los campos no coinciden con el contrato de upsert');
    }

    if (
      !isRecord(value.activity) ||
      !hasExactFields(value.activity, [
        'type',
        'title',
        'schedule',
        'status',
        'details',
      ])
    ) {
      invalid('activity', 'Se requiere una actividad completa');
    }

    operation = {
      action: 'upsert',
      activity: {
        ...value.activity,
        source_connection_id: context.source_connection_id,
        source_collection: context.source_collection,
        external_id: value.external_id,
        source_updated_at: value.source_updated_at,
      },
    };
  } else if (value.action === 'retire') {
    if (
      !hasExactFields(value, [
        'schema_version',
        'action',
        'external_id',
        'source_updated_at',
        'source_deleted_at',
      ])
    ) {
      invalid('body', 'Los campos no coinciden con el contrato de retire');
    }

    operation = {
      action: 'retire',
      source_connection_id: context.source_connection_id,
      source_collection: context.source_collection,
      external_id: value.external_id,
      source_updated_at: value.source_updated_at,
      source_deleted_at: value.source_deleted_at,
    };
  } else {
    invalid('action', 'La acción debe ser upsert o retire');
  }

  try {
    return normalizeActivityImport(operation, context);
  } catch (error) {
    if (error instanceof ActivityValidationError) {
      const path = error.path
        .replace(/^operation\./, '')
        .replace(/^activity\.(external_id|source_updated_at)$/, '$1');

      invalid(path, error.message);
    }

    throw error;
  }
}
