import type { ActivitySchedule, JsonValue } from '../activity.types';
import { isWholeMinuteInterval } from '../activity-schedule.validator';
import {
  hasExactFields,
  isRecord,
  isText,
} from '../../validation/value-validators';
export const PERSONAL_STATUSES = ['pending', 'completed', 'cancelled'] as const;
export function isPersonalDetails(
  value: unknown,
): value is Record<string, JsonValue> {
  return (
    isRecord(value) &&
    hasExactFields(value, ['people']) &&
    Array.isArray(value.people) &&
    value.people.length <= 50 &&
    value.people.every(
      (name: unknown) => isText(name, 100) && name === name.trim(),
    )
  );
}
export function isPersonalSchedule(value: ActivitySchedule): boolean {
  return value.kind !== 'interval' || isWholeMinuteInterval(value);
}
