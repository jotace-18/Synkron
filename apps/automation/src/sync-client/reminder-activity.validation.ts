import { isRecord, isUtcTimestamp, isUuid } from '../events/event-validation';
import type {
  ReminderActivity,
  ReminderActivitySchedule,
} from './reminder-activity.types';

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const timestamp = Date.parse(`${value}T00:00:00Z`);

  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function isSchedule(value: unknown): value is ReminderActivitySchedule {
  if (!isRecord(value)) {
    return false;
  }

  if (value.kind === 'date') {
    return (
      ['deadline', 'start'].includes(String(value.role)) &&
      isCalendarDate(value.date) &&
      value.at === null &&
      value.end_at === null
    );
  }

  if (value.kind === 'instant') {
    return (
      ['deadline', 'start'].includes(String(value.role)) &&
      value.date === null &&
      isUtcTimestamp(value.at) &&
      value.end_at === null
    );
  }

  if (value.kind === 'interval') {
    return (
      value.role === 'start' &&
      value.date === null &&
      isUtcTimestamp(value.at) &&
      isUtcTimestamp(value.end_at) &&
      Date.parse(value.end_at) > Date.parse(value.at)
    );
  }

  return false;
}

export function isReminderActivity(value: unknown): value is ReminderActivity {
  return (
    isRecord(value) &&
    isUuid(value.id) &&
    typeof value.type === 'string' &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    (value.status === null || typeof value.status === 'string') &&
    isSchedule(value.schedule)
  );
}
