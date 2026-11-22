export type ReminderActivitySchedule =
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

export interface ReminderActivity {
  id: string;
  type: string;
  title: string;
  status: string | null;
  schedule: ReminderActivitySchedule;
}

export interface ReminderActivitiesQuery {
  from: string;
  to: string;
  offset: number;
}
