import { isDataChangedPayload } from './data-changed.validation';
import { isRecord, isUtcTimestamp, isUuid } from './event-validation';
import {
  hasBalancedCounts,
  isSyncResultPayload,
} from './sync-result.validation';
import type { SyncEvent } from './sync-event.types';

const safeErrors: Record<string, string> = {
  source_error: 'No se pudieron obtener datos válidos de la fuente.',
  source_not_allowed: 'El destino de la fuente no está autorizado.',
  resource_not_found: 'No se encontró el recurso necesario para la ejecución.',
  configuration_conflict:
    'La configuración actual no permite ejecutar la sincronización.',
  invalid_configuration: 'La configuración de la sincronización no es válida.',
  dependency_unavailable: 'Una dependencia necesaria no está disponible.',
  storage_error: 'No se pudo guardar el resultado de la sincronización.',
  unknown_error: 'No se pudo completar la sincronización.',
};

export function parseSyncEvent(value: unknown): SyncEvent | null {
  if (
    !isRecord(value) ||
    !isUuid(value.event_id) ||
    !isUuid(value.tenant_id) ||
    !isUuid(value.correlation_id) ||
    !isUuid(value.causation_id) ||
    !isUtcTimestamp(value.occurred_at) ||
    value.schema_version !== 1 ||
    value.producer !== 'sync'
  ) {
    return null;
  }

  const payload = value.payload;

  if (
    !isRecord(payload) ||
    !isUuid(payload.sync_run_id) ||
    value.correlation_id.toLowerCase() !== payload.sync_run_id.toLowerCase() ||
    value.causation_id.toLowerCase() !== payload.sync_run_id.toLowerCase()
  ) {
    return null;
  }

  const envelope = {
    event_id: value.event_id,
    tenant_id: value.tenant_id,
    correlation_id: value.correlation_id,
    causation_id: value.causation_id,
    occurred_at: value.occurred_at,
    schema_version: 1 as const,
    producer: 'sync' as const,
  };

  if (value.event_type === 'data.changed') {
    if (
      typeof payload.change_type !== 'string' ||
      !isDataChangedPayload(payload)
    ) {
      return null;
    }

    return {
      ...envelope,
      event_type: 'data.changed',
      payload,
    };
  }

  if (!isSyncResultPayload(payload)) {
    return null;
  }

  if (value.event_type === 'sync.completed') {
    if (
      Object.keys(payload).length !== 3 ||
      !hasBalancedCounts(payload.counts)
    ) {
      return null;
    }

    return {
      ...envelope,
      event_type: 'sync.completed',
      payload,
    };
  }

  if (value.event_type === 'sync.failed') {
    const error = 'error' in payload ? payload.error : undefined;

    if (
      Object.keys(payload).length !== 4 ||
      !isRecord(error) ||
      Object.keys(error).length !== 2 ||
      typeof error.code !== 'string' ||
      !Object.hasOwn(safeErrors, error.code) ||
      error.message !== safeErrors[error.code]
    ) {
      return null;
    }

    return {
      ...envelope,
      event_type: 'sync.failed',
      payload: {
        sync_run_id: payload.sync_run_id,
        definition_id: payload.definition_id,
        counts: payload.counts,
        error: {
          code: error.code,
          message: safeErrors[error.code],
        },
      },
    };
  }

  return null;
}
