import { isUUID } from 'class-validator';
import { isText } from '../../validation/value-validators';
import { isTimestamp } from '../../validation/date-validators';
import {
  hasAcademicCourseFields,
  isAcademicGrade,
  isAcademicWeight,
} from '../../activities/academic/academic-details.rules';

export function hasAcademicSourceFields(
  item: Record<string, unknown>,
): boolean {
  return (
    typeof item.id === 'string' &&
    isUUID(item.id, '4') &&
    isText(item.title, 200) &&
    hasAcademicCourseFields(item) &&
    isAcademicWeight(item.weight_percent, item.weight_basis) &&
    isAcademicGrade(item.grade) &&
    isTimestamp(item.created_at) &&
    isTimestamp(item.updated_at) &&
    (item.deleted_at === null || isTimestamp(item.deleted_at))
  );
}
