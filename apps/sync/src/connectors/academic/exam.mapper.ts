import { BadGatewayException } from '@nestjs/common';
import type {
  ActivityImport,
  ActivitySchedule,
} from '../../activities/activity.types';
import { parseAcademicExam } from './exam-source.validator';

export function mapAcademicExam(
  sourceConnectionId: string,
  value: unknown,
): ActivityImport {
  const source = parseAcademicExam(value);

  const identity = {
    source_connection_id: sourceConnectionId,
    source_collection: 'exams',
    external_id: source.id,
  };

  const sourceUpdatedAt = new Date(source.updated_at).toISOString();

  if (source.deleted_at !== null) {
    return {
      action: 'retire',
      ...identity,
      source_updated_at: sourceUpdatedAt,
      source_deleted_at: new Date(source.deleted_at).toISOString(),
    };
  }

  let schedule: ActivitySchedule;

  if (source.exam_date !== null) {
    schedule = {
      kind: 'date',
      role: 'start',
      date: source.exam_date,
      at: null,
      end_at: null,
    };
  } else if (source.exam_at !== null) {
    schedule = {
      kind: 'instant',
      role: 'start',
      date: null,
      at: new Date(source.exam_at).toISOString(),
      end_at: null,
    };
  } else {
    throw new BadGatewayException('Academic devolvió un examen sin fecha');
  }

  return {
    action: 'upsert',
    activity: {
      ...identity,
      type: 'academic.exam',
      title: source.title,
      schedule,
      status: source.status,
      details: {
        course_name: source.course_name,
        course_abbreviation: source.course_abbreviation,
        section: source.section,
        topics: source.topics,
        weight_percent: source.weight_percent,
        weight_basis: source.weight_basis,
        grade: source.grade,
      },
      source_updated_at: sourceUpdatedAt,
    },
  };
}
