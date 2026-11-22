import { nextScheduleRun } from '../schedules/next-schedule-run';
import type { ReminderActivity } from '../sync-client/reminder-activity.types';
import type { ReminderSettingsInput } from './reminder.types';

const DAY = 24 * 60 * 60_000;

const madridDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function madridDate(date: Date): string {
  const parts = madridDateFormatter.formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)!.value;

  return `${read('year')}-${read('month')}-${read('day')}`;
}

export interface DueReminder {
  deadline_key: string;
  notify_at: Date;
}

export function dueReminder(
  activity: ReminderActivity,
  settings: ReminderSettingsInput,
  now: Date,
): DueReminder | null {
  if (!Number.isFinite(now.getTime())) {
    throw new Error('El instante de revisión no es válido');
  }

  if (!settings.enabled || !isReminderCandidate(activity)) return null;
  const schedule = activity.schedule;

  let deadlineKey: string;
  let notifyAt: Date;

  if (schedule.kind === 'date') {
    if (madridDate(now) > schedule.date) {
      return null;
    }

    const previousDay = new Date(
      Date.parse(`${schedule.date}T00:00:00Z`) - DAY,
    );

    notifyAt = nextScheduleRun(
      {
        schedule_kind: 'daily',
        interval_minutes: null,
        daily_time: '09:00',
        timezone: 'Europe/Madrid',
      },
      previousDay,
    );

    deadlineKey = `date:${schedule.date}`;
  } else if (schedule.kind === 'instant') {
    const deadline = new Date(schedule.at);

    if (deadline.getTime() <= now.getTime()) {
      return null;
    }

    notifyAt = new Date(deadline.getTime() - settings.lead_minutes * 60_000);

    deadlineKey = `instant:${deadline.toISOString()}`;
  } else {
    return null;
  }

  if (notifyAt.getTime() > now.getTime()) {
    return null;
  }

  return {
    deadline_key: deadlineKey,
    notify_at: notifyAt,
  };
}

export function isReminderCandidate(activity: ReminderActivity): boolean {
  return (
    (activity.type === 'academic.assignment' &&
      ['pending', 'in_progress'].includes(activity.status ?? '') &&
      activity.schedule.role === 'deadline') ||
    (activity.type === 'academic.exam' &&
      activity.status === 'scheduled' &&
      activity.schedule.role === 'start')
  );
}
