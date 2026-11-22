import { isCount, isRecord, isUuid } from './event-validation';
import type { SyncResultPayload, SyncRunCounts } from './sync-event.types';

const countFields = [
  'read',
  'created',
  'updated',
  'unchanged',
  'retired',
  'ignored',
] as const;

export function isSyncRunCounts(value: unknown): value is SyncRunCounts {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Object.keys(value).length === countFields.length &&
    countFields.every((field) => isCount(value[field]))
  );
}

export function isSyncResultPayload(
  value: unknown,
): value is SyncResultPayload {
  return (
    isRecord(value) &&
    isUuid(value.sync_run_id) &&
    isUuid(value.definition_id) &&
    isSyncRunCounts(value.counts)
  );
}

export function hasBalancedCounts(counts: SyncRunCounts): boolean {
  const processed =
    counts.created +
    counts.updated +
    counts.unchanged +
    counts.retired +
    counts.ignored;

  return Number.isSafeInteger(processed) && processed === counts.read;
}
