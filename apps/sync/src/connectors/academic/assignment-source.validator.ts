import { BadGatewayException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { AcademicAssignmentSource } from './assignment-source.types';
import { isCalendarDate, isTimestamp } from './academic-source-dates';

function isText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    [...value].length <= maxLength
  );
}

function isNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isOneOf(value: unknown, options: readonly string[]): boolean {
  return typeof value === 'string' && options.includes(value);
}

function isGrade(value: unknown): boolean {
  return (
    value === null ||
    (isNumberInRange(value, 0, 10) && value === Number(value.toFixed(2)))
  );
}

function isWeight(percent: unknown, basis: unknown): boolean {
  return (
    (percent === null && basis === null) ||
    (isNumberInRange(percent, 0, 100) && isOneOf(basis, ['course', 'section']))
  );
}

function isGroupMembers(workMode: unknown, members: unknown): boolean {
  return (
    Array.isArray(members) &&
    members.every(
      (member: unknown) =>
        typeof member === 'string' && member.trim().length > 0,
    ) &&
    (workMode === 'group' || members.length === 0)
  );
}

function isAcademicAssignment(
  value: unknown,
): value is AcademicAssignmentSource {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.id === 'string' &&
    isUUID(item.id, '4') &&
    isText(item.title, 200) &&
    isText(item.course_name, 150) &&
    (item.course_abbreviation === null ||
      isText(item.course_abbreviation, 20)) &&
    isOneOf(item.section, ['theory', 'practice', 'seminar']) &&
    typeof item.mandatory === 'boolean' &&
    (item.due_date === null
      ? isTimestamp(item.due_at)
      : isCalendarDate(item.due_date) && item.due_at === null) &&
    isOneOf(item.status, ['pending', 'in_progress', 'submitted']) &&
    isOneOf(item.work_mode, ['individual', 'group']) &&
    isGroupMembers(item.work_mode, item.group_members) &&
    isWeight(item.weight_percent, item.weight_basis) &&
    isGrade(item.grade) &&
    isTimestamp(item.created_at) &&
    isTimestamp(item.updated_at) &&
    (item.deleted_at === null || isTimestamp(item.deleted_at))
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
