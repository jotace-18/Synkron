import { dueReminder, isReminderCandidate } from './due-reminder';
import type { ReminderActivity } from '../sync-client/reminder-activity.types';
const exam: ReminderActivity = {
  id: 'exam',
  type: 'academic.exam',
  title: 'CC',
  status: 'scheduled',
  schedule: {
    kind: 'date',
    role: 'start',
    date: '2026-11-25',
    at: null,
    end_at: null,
  },
};
const settings = { enabled: true, lead_minutes: 1440 as const };
describe('Exam reminders', () => {
  it('uses 09:00 Madrid the previous day for date-only exams and keeps the local exam day valid', () => {
    expect(
      dueReminder(exam, settings, new Date('2026-11-24T07:59:00Z')),
    ).toBeNull();
    expect(
      dueReminder(exam, settings, new Date('2026-11-25T20:00:00Z')),
    ).toEqual({
      deadline_key: 'date:2026-11-25',
      notify_at: new Date('2026-11-24T08:00:00Z'),
    });
    expect(
      dueReminder(exam, settings, new Date('2026-11-26T00:00:00Z')),
    ).toBeNull();
  });
  it('ignores completed/cancelled exams and expires timed exams at their start', () => {
    for (const status of ['completed', 'cancelled'])
      expect(isReminderCandidate({ ...exam, status })).toBe(false);
    const timed: ReminderActivity = {
      ...exam,
      schedule: {
        kind: 'instant',
        role: 'start',
        date: null,
        at: '2026-11-25T10:00:00Z',
        end_at: null,
      },
    };
    expect(
      dueReminder(timed, settings, new Date('2026-11-24T11:00:00Z'))?.notify_at,
    ).toEqual(new Date('2026-11-24T10:00:00Z'));
    expect(
      dueReminder(timed, settings, new Date('2026-11-25T10:00:00Z')),
    ).toBeNull();
  });
});
