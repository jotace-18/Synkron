import type { ActivityInput, ActivitySchedule } from './activity.types';
import type { ActivityView } from './activity-view.types';

export interface ActivityRow extends Omit<
  ActivityInput,
  'schedule' | 'source_updated_at'
> {
  id: string;
  time_kind: ActivitySchedule['kind'];
  time_role: ActivitySchedule['role'];
  on_date: string | null;
  at: Date | null;
  end_at: Date | null;
  source_updated_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_synced_at: Date;
}

export function toActivityView(row: ActivityRow): ActivityView {
  let schedule: ActivitySchedule;

  if (row.time_kind === 'date' && row.on_date !== null) {
    schedule = {
      kind: 'date',
      role: row.time_role,
      date: row.on_date,
      at: null,
      end_at: null,
    };
  } else if (row.time_kind === 'instant' && row.at !== null) {
    schedule = {
      kind: 'instant',
      role: row.time_role,
      date: null,
      at: row.at.toISOString(),
      end_at: null,
    };
  } else if (
    row.time_kind === 'interval' &&
    row.time_role === 'start' &&
    row.at !== null &&
    row.end_at !== null
  ) {
    schedule = {
      kind: 'interval',
      role: 'start',
      date: null,
      at: row.at.toISOString(),
      end_at: row.end_at.toISOString(),
    };
  } else {
    throw new Error('La actividad tiene un formato temporal incoherente');
  }

  return {
    id: row.id,
    source_connection_id: row.source_connection_id,
    source_collection: row.source_collection,
    external_id: row.external_id,
    type: row.type,
    title: row.title,
    schedule,
    status: row.status,
    details: row.details,
    source_updated_at: row.source_updated_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    last_synced_at: row.last_synced_at.toISOString(),
  };
}
