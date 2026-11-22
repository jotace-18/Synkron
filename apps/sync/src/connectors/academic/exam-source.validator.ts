import { BadGatewayException } from '@nestjs/common';
import { parseAcademicAssignment } from './assignment-source.validator';
import type { AcademicExamSource } from './exam-source.types';

export function parseAcademicExam(value: unknown): AcademicExamSource {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new BadGatewayException('Academic devolvió un examen inválido');
  const item = value as Record<string, unknown>;
  if (
    !['scheduled', 'completed', 'cancelled'].includes(String(item.status)) ||
    !['theory', 'practice'].includes(String(item.section)) ||
    !(
      item.topics === null ||
      (typeof item.topics === 'string' &&
        item.topics.trim().length > 0 &&
        [...item.topics].length <= 1000)
    )
  )
    throw new BadGatewayException('Academic devolvió un examen inválido');
  parseAcademicAssignment({
    ...item,
    due_date: item.exam_date,
    due_at: item.exam_at,
    status: 'pending',
    mandatory: false,
    work_mode: 'individual',
    group_members: [],
  });
  return value as AcademicExamSource;
}
