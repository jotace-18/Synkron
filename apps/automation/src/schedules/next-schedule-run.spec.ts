import { nextScheduleRun } from './next-schedule-run';
import type { ScheduleTiming } from './schedule.types';

describe('nextScheduleRun', () => {
  const interval: ScheduleTiming = {
    schedule_kind: 'interval',
    interval_minutes: 15,
    daily_time: null,
    timezone: 'Europe/Madrid',
  };

  function daily(time: string): ScheduleTiming {
    return {
      schedule_kind: 'daily',
      interval_minutes: null,
      daily_time: time,
      timezone: 'Europe/Madrid',
    };
  }

  it('starts after one interval and skips missed occasions without drifting', () => {
    expect(
      nextScheduleRun(interval, new Date('2026-11-19T10:07:00Z')).toISOString(),
    ).toBe('2026-11-19T10:22:00.000Z');

    expect(
      nextScheduleRun(
        interval,
        new Date('2026-11-19T11:07:00Z'),
        new Date('2026-11-19T10:00:00Z'),
      ).toISOString(),
    ).toBe('2026-11-19T11:15:00.000Z');
  });

  it('chooses the next daily occasion in Madrid', () => {
    expect(
      nextScheduleRun(
        daily('08:00'),
        new Date('2026-11-19T06:00:00Z'),
      ).toISOString(),
    ).toBe('2026-11-19T07:00:00.000Z');

    expect(
      nextScheduleRun(
        daily('08:00'),
        new Date('2026-11-19T07:00:00Z'),
      ).toISOString(),
    ).toBe('2026-11-20T07:00:00.000Z');
  });

  it('uses the first valid minute after a nonexistent spring time', () => {
    expect(
      nextScheduleRun(
        daily('02:30'),
        new Date('2026-03-29T00:00:00Z'),
      ).toISOString(),
    ).toBe('2026-03-29T01:00:00.000Z');
  });

  it('uses the first autumn occurrence and does not repeat it', () => {
    expect(
      nextScheduleRun(
        daily('02:30'),
        new Date('2026-10-25T00:00:00Z'),
      ).toISOString(),
    ).toBe('2026-10-25T00:30:00.000Z');

    expect(
      nextScheduleRun(
        daily('02:30'),
        new Date('2026-10-25T00:45:00Z'),
      ).toISOString(),
    ).toBe('2026-10-26T01:30:00.000Z');
  });
});
