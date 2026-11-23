import type { ActivitySchedule, JsonValue } from '../activity.types';
import {
  hasExactFields,
  isOneOf,
  isRecord,
} from '../../validation/value-validators';
export const TRAINING_MODES = [
  'push',
  'pull',
  'leg',
  'upper',
  'lower',
  'other',
] as const;
export const GYM_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export function isGymDetails(
  value: unknown,
): value is Record<string, JsonValue> {
  return (
    isRecord(value) &&
    hasExactFields(value, ['training_mode', 'accompanied']) &&
    isOneOf(value.training_mode, TRAINING_MODES) &&
    typeof value.accompanied === 'boolean'
  );
}
export function isGymInterval(value: ActivitySchedule): boolean {
  if (value.kind !== 'interval') return false;
  const minutes = (Date.parse(value.end_at) - Date.parse(value.at)) / 60_000;
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 2_147_483_647;
}
