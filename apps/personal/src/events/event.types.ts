export const EVENT_STATUSES = ['pending', 'completed', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export interface StoredEvent {
  id: string;
  title: string;
  on_date: string | null;
  started_at: Date | null;
  duration_minutes: number | null;
  people: string[];
  status: EventStatus;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}
export interface EventView extends Omit<
  StoredEvent,
  'started_at' | 'created_at' | 'updated_at' | 'deleted_at'
> {
  started_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export function toEventView(row: StoredEvent): EventView {
  return {
    id: row.id,
    title: row.title,
    on_date: row.on_date,
    duration_minutes: row.duration_minutes,
    people: row.people,
    status: row.status,
    started_at: row.started_at?.toISOString() ?? null,
    end_at:
      row.started_at && row.duration_minutes !== null
        ? new Date(
            row.started_at.getTime() + row.duration_minutes * 60_000,
          ).toISOString()
        : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at?.toISOString() ?? null,
  };
}
