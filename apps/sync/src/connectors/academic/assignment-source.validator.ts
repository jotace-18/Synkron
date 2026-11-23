import { BadGatewayException } from '@nestjs/common';
import type { AcademicAssignmentSource } from './assignment-source.types';
import { hasAcademicSourceFields } from './academic-source-fields';
import {
  ASSIGNMENT_SECTIONS,
  ASSIGNMENT_STATUSES,
  WORK_MODES,
  isAcademicGroupMembers,
} from '../../activities/academic/academic-details.rules';
import { isOneOf, isRecord } from '../../validation/value-validators';
import { isCalendarDate, isTimestamp } from '../../validation/date-validators';

function isAcademicAssignment(
  value: unknown,
): value is AcademicAssignmentSource {
  if (!isRecord(value)) return false;

  return (
    hasAcademicSourceFields(value) &&
    isOneOf(value.section, ASSIGNMENT_SECTIONS) &&
    typeof value.mandatory === 'boolean' &&
    (value.due_date === null
      ? isTimestamp(value.due_at)
      : isCalendarDate(value.due_date) && value.due_at === null) &&
    isOneOf(value.status, ASSIGNMENT_STATUSES) &&
    isOneOf(value.work_mode, WORK_MODES) &&
    isAcademicGroupMembers(value.work_mode, value.group_members)
  );
}

export function parseAcademicAssignment(
  value: unknown,
): AcademicAssignmentSource {
  if (!isAcademicAssignment(value)) {
    throw new BadGatewayException(
      'Academic devolvió una entrega con estructura inválida',
    );
  }

  return value;
}
