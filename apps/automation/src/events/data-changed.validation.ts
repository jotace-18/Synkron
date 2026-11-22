import { isRecord, isUuid } from './event-validation';
import type { DataChangedPayload } from './sync-event.types';

const payloadFields = [
  'sync_run_id',
  'activity_id',
  'source_connection_id',
  'source_collection',
  'activity_type',
  'external_id',
  'change_type',
  'changed_fields',
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isChangedFields(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

export function isDataChangedPayload(
  value: unknown,
): value is DataChangedPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Object.keys(value).length === payloadFields.length &&
    payloadFields.every((field) => Object.hasOwn(value, field)) &&
    isUuid(value.sync_run_id) &&
    isUuid(value.activity_id) &&
    isUuid(value.source_connection_id) &&
    isNonEmptyString(value.source_collection) &&
    isNonEmptyString(value.activity_type) &&
    isNonEmptyString(value.external_id) &&
    ['created', 'updated', 'retired'].includes(String(value.change_type)) &&
    isChangedFields(value.changed_fields)
  );
}
