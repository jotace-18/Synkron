import {
  EXAM_SECTIONS,
  EXAM_STATUSES,
} from '../../activities/academic/academic-details.rules';
import { BadGatewayException } from '@nestjs/common';
import type { AcademicExamSource } from './exam-source.types';
import { hasAcademicSourceFields } from './academic-source-fields';
import { isOneOf, isRecord, isText } from '../../validation/value-validators';
import { isCalendarDate, isTimestamp } from '../../validation/date-validators';

function isAcademicExam(value: unknown): value is AcademicExamSource {
  if (!isRecord(value)) return false;

  return (
    hasAcademicSourceFields(value) &&
    isOneOf(value.section, EXAM_SECTIONS) &&
    isOneOf(value.status, EXAM_STATUSES) &&
    (value.topics === null || isText(value.topics, 1000)) &&
    (value.exam_date === null
      ? isTimestamp(value.exam_at)
      : isCalendarDate(value.exam_date) && value.exam_at === null)
  );
}

export function parseAcademicExam(value: unknown): AcademicExamSource {
  if (!isAcademicExam(value)) {
    throw new BadGatewayException('Academic devolvió un examen inválido');
  }

  return value;
}
