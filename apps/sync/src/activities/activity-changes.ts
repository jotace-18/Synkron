import { canonicalJson } from './activity-content-hash';
import type {
  ActivityInput,
  ActivitySchedule,
  ActivityType,
  JsonValue,
} from './activity.types';

export interface StoredActivityContent {
  type: ActivityType;
  title: string;
  time_kind: ActivitySchedule['kind'];
  time_role: ActivitySchedule['role'];
  on_date: string | null;
  at: Date | null;
  end_at: Date | null;
  status: string | null;
  details: Record<string, JsonValue>;
  deleted_at: Date | null;
}

export function changedActivityFields(
  previous: StoredActivityContent,
  next: ActivityInput,
): string[] {
  const fields: string[] = [];

  for (const field of ['type', 'title', 'status'] as const) {
    if (previous[field] !== next[field]) {
      fields.push(field);
    }
  }

  const previousSchedule = {
    kind: previous.time_kind,
    role: previous.time_role,
    date: previous.on_date,
    at: previous.at?.toISOString() ?? null,
    end_at: previous.end_at?.toISOString() ?? null,
  };

  if (canonicalJson(previousSchedule) !== canonicalJson(next.schedule)) {
    fields.push('schedule');
  }

  const detailFields = new Set([
    ...Object.keys(previous.details),
    ...Object.keys(next.details),
  ]);

  for (const field of detailFields) {
    if (
      Object.hasOwn(previous.details, field) !==
        Object.hasOwn(next.details, field) ||
      canonicalJson(previous.details[field]) !==
        canonicalJson(next.details[field])
    ) {
      fields.push(field);
    }
  }

  if (previous.deleted_at !== null) {
    fields.push('deleted_at');
  }

  return [...new Set(fields)].sort();
}
