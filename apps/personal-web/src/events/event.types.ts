export const EVENT_STATUSES = ["pending", "completed", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const STATUS_LABELS: Record<EventStatus, string> = {
  pending: "Pendiente",
  completed: "Realizado",
  cancelled: "Cancelado",
};
export interface EventInput {
  title: string;
  on_date: string | null;
  started_at: string | null;
  duration_minutes: number | null;
  people: string[];
  status: EventStatus;
}
export interface PersonalEvent extends EventInput {
  id: string;
  end_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: null;
}
