export type ActivityType =
  | 'academic.assignment'
  | 'academic.exam'
  | 'academic.work_session'
  | 'academic.event'
  | 'sport.gym'
  | 'sport.football'
  | 'sport.hiking'
  | 'sport.running'
  | 'sport.other'
  | 'social.plan';

export type ActivitySchedule =
  | {
      kind: 'date';
      role: 'deadline' | 'start';
      date: string;
      at: null;
      end_at: null;
    }
  | {
      kind: 'instant';
      role: 'deadline' | 'start';
      date: null;
      at: string;
      end_at: null;
    }
  | {
      kind: 'interval';
      role: 'start';
      date: null;
      at: string;
      end_at: string;
    };

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ActivityInput {
  source_connection_id: string;
  source_collection: string;
  external_id: string;
  type: ActivityType;
  title: string;
  schedule: ActivitySchedule;
  status: string | null;
  details: Record<string, JsonValue>;
  source_updated_at: string | null;
}

export type ActivityImport =
  | {
      action: 'upsert';
      activity: ActivityInput;
    }
  | {
      action: 'retire';
      source_connection_id: string;
      source_collection: string;
      external_id: string;
      source_updated_at: string | null;
      source_deleted_at: string;
    };
