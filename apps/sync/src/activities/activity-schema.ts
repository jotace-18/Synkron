import {
  GYM_STATUSES,
  isGymDetails,
  isGymInterval,
} from './sport/gym-details.validator';
import {
  ASSIGNMENT_STATUSES,
  EXAM_STATUSES,
} from './academic/academic-details.rules';
import type {
  ActivitySchedule,
  ActivityType,
  JsonValue,
} from './activity.types';
import {
  isAssignmentDetails,
  isExamDetails,
} from './academic/academic-details.validator';

export interface ActivitySchema {
  role: ActivitySchedule['role'];
  kinds: readonly ActivitySchedule['kind'][];
  statuses: readonly (string | null)[];
  isSchedule?: (value: ActivitySchedule) => boolean;
  isDetails: (value: unknown) => value is Record<string, JsonValue>;
}

// A planned ActivityType does not enable ingestion until its schema is registered.
const schemas: Partial<Record<ActivityType, ActivitySchema>> = {
  'sport.gym': {
    role: 'start',
    kinds: ['interval'],
    statuses: GYM_STATUSES,
    isDetails: isGymDetails,
    isSchedule: isGymInterval,
  },
  'academic.assignment': {
    role: 'deadline',
    kinds: ['date', 'instant'],
    statuses: ASSIGNMENT_STATUSES,
    isDetails: isAssignmentDetails,
  },
  'academic.exam': {
    role: 'start',
    kinds: ['date', 'instant'],
    statuses: EXAM_STATUSES,
    isDetails: isExamDetails,
  },
};

export function getActivitySchema(type: string): ActivitySchema | null {
  if (!Object.hasOwn(schemas, type)) return null;
  return schemas[type as ActivityType] ?? null;
}

export function getEnabledActivityTypes(): ActivityType[] {
  return Object.keys(schemas) as ActivityType[];
}
