export const TRAINING_MODES = [
  "push",
  "pull",
  "leg",
  "upper",
  "lower",
  "other",
] as const;
export const GYM_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type TrainingMode = (typeof TRAINING_MODES)[number];
export type GymStatus = (typeof GYM_STATUSES)[number];
export const MODE_LABELS: Record<TrainingMode, string> = {
  push: "Push",
  pull: "Pull",
  leg: "Leg",
  upper: "Upper",
  lower: "Lower",
  other: "Otros",
};
export const STATUS_LABELS: Record<GymStatus, string> = {
  scheduled: "Programado",
  completed: "Realizado",
  cancelled: "Cancelado",
};
export interface GymInput {
  started_at: string;
  duration_minutes: number;
  training_mode: TrainingMode;
  accompanied: boolean;
  status: GymStatus;
}
export interface GymSession extends GymInput {
  id: string;
  title: string;
  end_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
