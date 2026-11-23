import type { ActivitySchedule } from './activity.types';
import { isCalendarDate, isTimestamp } from '../validation/date-validators';
import { isOneOf, isRecord } from '../validation/value-validators';

const scheduleFields = new Set(['kind', 'role', 'date', 'at', 'end_at']);

export function isActivitySchedule(value: unknown): value is ActivitySchedule {
  if (!isRecord(value)) return false;

  const keys = Object.keys(value);

  if (
    keys.length !== scheduleFields.size ||
    !keys.every((key) => scheduleFields.has(key))
  ) {
    return false;
  }

  if (!isOneOf(value.role, ['deadline', 'start'])) {
    return false;
  }

  switch (value.kind) {
    case 'date':
      return (
        isCalendarDate(value.date) && value.at === null && value.end_at === null
      );

    case 'instant':
      return (
        value.date === null && isTimestamp(value.at) && value.end_at === null
      );

    case 'interval':
      return (
        value.role === 'start' &&
        value.date === null &&
        isTimestamp(value.at) &&
        isTimestamp(value.end_at) &&
        Date.parse(value.end_at) > Date.parse(value.at)
      );

    default:
      return false;
  }
}

// Source durations are expressed in whole minutes; keep the rule shared by types.
export function isWholeMinuteInterval(value: ActivitySchedule): boolean {
  if (value.kind !== 'interval') return false;
  const minutes = (Date.parse(value.end_at) - Date.parse(value.at)) / 60_000;
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 2_147_483_647;
}
