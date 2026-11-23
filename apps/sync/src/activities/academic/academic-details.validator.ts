import type { JsonValue } from '../activity.types';
import {
  hasExactFields,
  isOneOf,
  isRecord,
  isText,
} from '../../validation/value-validators';
import {
  ASSIGNMENT_SECTIONS,
  EXAM_SECTIONS,
  WORK_MODES,
  hasAcademicCourseFields,
  isAcademicGrade,
  isAcademicGroupMembers,
  isAcademicWeight,
} from './academic-details.rules';

function hasAcademicDetails(value: Record<string, unknown>): boolean {
  return (
    hasAcademicCourseFields(value) &&
    isAcademicGrade(value.grade) &&
    isAcademicWeight(value.weight_percent, value.weight_basis)
  );
}

export function isAssignmentDetails(
  value: unknown,
): value is Record<string, JsonValue> {
  return (
    isRecord(value) &&
    hasExactFields(value, [
      'course_name',
      'course_abbreviation',
      'section',
      'mandatory',
      'work_mode',
      'group_members',
      'weight_percent',
      'weight_basis',
      'grade',
    ]) &&
    hasAcademicDetails(value) &&
    isOneOf(value.section, ASSIGNMENT_SECTIONS) &&
    typeof value.mandatory === 'boolean' &&
    isOneOf(value.work_mode, WORK_MODES) &&
    isAcademicGroupMembers(value.work_mode, value.group_members)
  );
}

export function isExamDetails(
  value: unknown,
): value is Record<string, JsonValue> {
  return (
    isRecord(value) &&
    hasExactFields(value, [
      'course_name',
      'course_abbreviation',
      'section',
      'topics',
      'weight_percent',
      'weight_basis',
      'grade',
    ]) &&
    hasAcademicDetails(value) &&
    isOneOf(value.section, EXAM_SECTIONS) &&
    (value.topics === null || isText(value.topics, 1000))
  );
}
