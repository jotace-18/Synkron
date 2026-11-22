import { BadGatewayException } from '@nestjs/common';
import type {
  ActivityImport,
  ActivitySchedule,
} from '../../activities/activity.types';
import { parseAcademicAssignment } from './assignment-source.validator';

export function mapAcademicAssignment(
  sourceConnectionId: string,
  value: unknown,
): ActivityImport {
  const source = parseAcademicAssignment(value);

  const identity = {
    source_connection_id: sourceConnectionId,
    source_collection: 'assignments',
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

  if (source.due_date !== null) {
    schedule = {
      kind: 'date',
      role: 'deadline',
      date: source.due_date,
      at: null,
      end_at: null,
    };
  } else if (source.due_at !== null) {
    schedule = {
      kind: 'instant',
      role: 'deadline',
      date: null,
      at: new Date(source.due_at).toISOString(),
      end_at: null,
    };
  } else {
    throw new BadGatewayException(
      'Academic devolvió una entrega sin vencimiento',
    );
  }

  return {
    action: 'upsert',
    activity: {
      ...identity,
      type: 'academic.assignment',
      title: source.title,
      schedule,
      status: source.status,
      details: {
        course_name: source.course_name,
        course_abbreviation: source.course_abbreviation,
        section: source.section,
        mandatory: source.mandatory,
        work_mode: source.work_mode,
        group_members: [...source.group_members],
        weight_percent: source.weight_percent,
        weight_basis: source.weight_basis,
        grade: source.grade,
      },
      source_updated_at: sourceUpdatedAt,
    },
  };
}
