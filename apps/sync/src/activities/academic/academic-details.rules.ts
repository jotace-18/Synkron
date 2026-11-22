import {
  isNumberInRange,
  isOneOf,
  isText,
} from '../../validation/value-validators';

export const ASSIGNMENT_STATUSES = [
  'pending',
  'in_progress',
  'submitted',
] as const;
export const EXAM_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export const ASSIGNMENT_SECTIONS = ['theory', 'practice', 'seminar'] as const;
export const EXAM_SECTIONS = ['theory', 'practice'] as const;
export const WORK_MODES = ['individual', 'group'] as const;

export function hasAcademicCourseFields(
  value: Record<string, unknown>,
): boolean {
  return (
    isText(value.course_name, 150) &&
    (value.course_abbreviation === null ||
      isText(value.course_abbreviation, 20))
  );
}

export function isAcademicGrade(value: unknown): boolean {
  return (
    value === null ||
    (isNumberInRange(value, 0, 10) && value === Number(value.toFixed(2)))
  );
}

export function isAcademicWeight(percent: unknown, basis: unknown): boolean {
  return (
    (percent === null && basis === null) ||
    (isNumberInRange(percent, 0, 100) && isOneOf(basis, ['course', 'section']))
  );
}

export function isAcademicGroupMembers(
  workMode: unknown,
  members: unknown,
): boolean {
  return (
    Array.isArray(members) &&
    members.every(
      (member: unknown) =>
        typeof member === 'string' && member.trim().length > 0,
    ) &&
    (workMode === 'group' || members.length === 0)
  );
}
