import type {
  ActivityImport,
  ActivityInput,
  ActivitySchedule,
  ActivityType,
} from '../activities/activity.types';
import { isActivitySchedule } from '../activities/activity-schedule.validator';
import { getActivitySchema } from '../activities/activity-schema';
import { isTimestamp } from '../validation/date-validators';
import {
  hasExactFields,
  isRecord,
  isText,
} from '../validation/value-validators';

// Constructed by the authenticated transport, never from a supplied tenant ID.
export interface ActivityImportContext {
  tenant_id: string;
  source_connection_id: string;
  source_collection: string;
  allowed_types: readonly ActivityType[];
}

// Domain error: each transport selects its HTTP/source error representation.
export class ActivityValidationError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'ActivityValidationError';
  }
}

function requireValid(
  condition: unknown,
  path: string,
  message: string,
): asserts condition {
  if (!condition) throw new ActivityValidationError(path, message);
}

function normalizeTimestamp(value: unknown, path: string): string {
  requireValid(
    isTimestamp(value),
    path,
    'Se requiere un instante con zona explícita',
  );
  const normalized = new Date(value).toISOString();
  requireValid(
    isTimestamp(normalized),
    path,
    'El instante UTC queda fuera del rango de años permitido',
  );
  return normalized;
}

function normalizeSourceTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : normalizeTimestamp(value, path);
}

function normalizeSchedule(schedule: ActivitySchedule): ActivitySchedule {
  if (schedule.kind === 'date') return { ...schedule };
  if (schedule.kind === 'instant')
    return {
      ...schedule,
      at: normalizeTimestamp(schedule.at, 'activity.schedule.at'),
    };
  return {
    ...schedule,
    at: normalizeTimestamp(schedule.at, 'activity.schedule.at'),
    end_at: normalizeTimestamp(schedule.end_at, 'activity.schedule.end_at'),
  };
}

function identity(
  value: Record<string, unknown>,
  context: ActivityImportContext,
  path: string,
) {
  requireValid(
    value.source_connection_id === context.source_connection_id,
    `${path}.source_connection_id`,
    'La conexión no coincide con la procedencia autorizada',
  );
  requireValid(
    value.source_collection === context.source_collection,
    `${path}.source_collection`,
    'La colección no coincide con la procedencia autorizada',
  );
  requireValid(
    isText(value.external_id, 256) &&
      value.external_id === value.external_id.trim(),
    `${path}.external_id`,
    'Se requiere un identificador externo estable, sin espacios exteriores y de hasta 256 caracteres',
  );
  return {
    source_connection_id: context.source_connection_id,
    source_collection: context.source_collection,
    external_id: value.external_id,
    source_updated_at: normalizeSourceTimestamp(
      value.source_updated_at,
      `${path}.source_updated_at`,
    ),
  };
}

export function normalizeActivityImport(
  value: unknown,
  context: ActivityImportContext,
): ActivityImport {
  requireValid(isRecord(value), 'operation', 'La operación debe ser un objeto');

  if (value.action === 'retire') {
    requireValid(
      hasExactFields(value, [
        'action',
        'source_connection_id',
        'source_collection',
        'external_id',
        'source_updated_at',
        'source_deleted_at',
      ]),
      'operation',
      'La retirada debe contener exclusivamente su identidad y fechas',
    );
    return {
      action: 'retire',
      ...identity(value, context, 'operation'),
      source_deleted_at: normalizeTimestamp(
        value.source_deleted_at,
        'operation.source_deleted_at',
      ),
    };
  }

  requireValid(
    value.action === 'upsert',
    'operation.action',
    'La acción debe ser upsert o retire',
  );
  requireValid(
    hasExactFields(value, ['action', 'activity']) && isRecord(value.activity),
    'activity',
    'Se requiere una actividad completa',
  );
  const activity = value.activity;
  requireValid(
    hasExactFields(activity, [
      'source_connection_id',
      'source_collection',
      'external_id',
      'type',
      'title',
      'schedule',
      'status',
      'details',
      'source_updated_at',
    ]),
    'activity',
    'La actividad debe contener exclusivamente los campos del contrato común',
  );
  const source = identity(activity, context, 'activity');
  requireValid(
    typeof activity.type === 'string',
    'activity.type',
    'Se requiere un tipo de actividad',
  );
  const schema = getActivitySchema(activity.type);
  requireValid(
    schema && context.allowed_types.some((type) => type === activity.type),
    'activity.type',
    'El tipo no está habilitado para esta fuente',
  );
  requireValid(
    isText(activity.title, 200),
    'activity.title',
    'Se requiere un título de hasta 200 caracteres',
  );
  requireValid(
    isActivitySchedule(activity.schedule),
    'activity.schedule',
    'El horario no cumple el contrato común',
  );
  requireValid(
    activity.schedule.role === schema.role &&
      schema.kinds.includes(activity.schedule.kind) &&
      (!schema.isSchedule || schema.isSchedule(activity.schedule)),
    'activity.schedule',
    'El horario no está permitido para este tipo',
  );
  requireValid(
    (activity.status === null || typeof activity.status === 'string') &&
      schema.statuses.includes(activity.status),
    'activity.status',
    'El estado no está permitido para este tipo',
  );
  requireValid(
    schema.isDetails(activity.details),
    'activity.details',
    'Los detalles no cumplen el esquema del tipo',
  );

  const normalized: ActivityInput = {
    ...source,
    type: activity.type as ActivityType,
    title: activity.title.trim(),
    schedule: normalizeSchedule(activity.schedule),
    status: activity.status,
    details: structuredClone(activity.details),
  };
  return { action: 'upsert', activity: normalized };
}
