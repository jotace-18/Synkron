import { createHash } from 'node:crypto';
import type { ActivityInput, JsonValue } from './activity.types';

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }

  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);

  return `{${entries.join(',')}}`;
}

export function activityContentHash(activity: ActivityInput): string {
  const content = canonicalJson({
    type: activity.type,
    title: activity.title,
    schedule: {
      kind: activity.schedule.kind,
      role: activity.schedule.role,
      date: activity.schedule.date,
      at: activity.schedule.at,
      end_at: activity.schedule.end_at,
    },
    status: activity.status,
    details: activity.details,
  });

  return createHash('sha256').update(content).digest('hex');
}
