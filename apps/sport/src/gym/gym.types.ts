export const TRAINING_MODES = [
  'push',
  'pull',
  'leg',
  'upper',
  'lower',
  'other',
] as const;
export const GYM_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type TrainingMode = (typeof TRAINING_MODES)[number];
export type GymStatus = (typeof GYM_STATUSES)[number];

const modeLabels: Record<TrainingMode, string> = {
  push: 'Push',
  pull: 'Pull',
  leg: 'Leg',
  upper: 'Upper',
  lower: 'Lower',
  other: 'Otros',
};

export interface StoredGymSession {
  id: string;
  started_at: Date;
  duration_minutes: number;
  training_mode: TrainingMode;
  accompanied: boolean;
  status: GymStatus;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface GymSessionView {
  id: string;
  title: string;
  started_at: string;
  end_at: string;
  duration_minutes: number;
  training_mode: TrainingMode;
  accompanied: boolean;
  status: GymStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function toGymSessionView(row: StoredGymSession): GymSessionView {
  return {
    id: row.id,
    title: `Gimnasio · ${modeLabels[row.training_mode]}`,
    started_at: row.started_at.toISOString(),
    end_at: new Date(
      row.started_at.getTime() + row.duration_minutes * 60_000,
    ).toISOString(),
    duration_minutes: row.duration_minutes,
    training_mode: row.training_mode,
    accompanied: row.accompanied,
    status: row.status,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at?.toISOString() ?? null,
  };
}
