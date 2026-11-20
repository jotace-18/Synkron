export type ScheduleTiming =
  | {
      schedule_kind: 'interval';
      interval_minutes: 15 | 30 | 60;
      daily_time: null;
      timezone: 'Europe/Madrid';
    }
  | {
      schedule_kind: 'daily';
      interval_minutes: null;
      daily_time: string;
      timezone: 'Europe/Madrid';
    };

export type ScheduleInput = ScheduleTiming & {
  name: string;
  definition_id: string;
  enabled: boolean;
};

export type StoredSchedule = ScheduleInput & {
  id: string;
  tenant_id: string;
  next_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ScheduleView = ScheduleInput & {
  id: string;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};
