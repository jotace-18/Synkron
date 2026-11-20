import type { ScheduleTiming } from './schedule.types';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const madridClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function localParts(date: Date) {
  const parts = madridClock.formatToParts(date);

  function read(type: Intl.DateTimeFormatPartTypes): number {
    return Number(parts.find((part) => part.type === type)?.value);
  }

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

function checkedDate(timestamp: number): Date {
  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    throw new Error('La fecha de programación no es válida');
  }

  return date;
}

function dailyOccurrence(day: Date, targetMinute: number): Date {
  // Recorremos instantes reales en orden, incluyendo los dos posibles
  // desfases de Madrid respecto a UTC.
  for (let minute = -180; minute < 1440; minute += 1) {
    const candidate = checkedDate(day.getTime() + minute * MINUTE);
    const local = localParts(candidate);

    if (
      local.year === day.getUTCFullYear() &&
      local.month === day.getUTCMonth() + 1 &&
      local.day === day.getUTCDate() &&
      local.hour * 60 + local.minute >= targetMinute
    ) {
      return candidate;
    }
  }

  throw new Error('No se pudo calcular la hora diaria');
}

export function nextScheduleRun(
  timing: ScheduleTiming,
  after: Date,
  previousRunAt?: Date,
): Date {
  if (
    timing.timezone !== 'Europe/Madrid' ||
    !Number.isFinite(after.getTime()) ||
    (previousRunAt && !Number.isFinite(previousRunAt.getTime()))
  ) {
    throw new Error('La configuración temporal no es válida');
  }

  if (timing.schedule_kind === 'interval') {
    if (![15, 30, 60].includes(timing.interval_minutes)) {
      throw new Error('El intervalo no es válido');
    }

    const period = timing.interval_minutes * MINUTE;

    if (!previousRunAt) {
      return checkedDate(after.getTime() + period);
    }

    const steps = Math.max(
      0,
      Math.floor((after.getTime() - previousRunAt.getTime()) / period) + 1,
    );

    return checkedDate(previousRunAt.getTime() + steps * period);
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(timing.daily_time);

  if (!match) {
    throw new Error('La hora diaria no es válida');
  }

  const targetMinute = Number(match[1]) * 60 + Number(match[2]);
  const local = localParts(after);
  const today = new Date(0);

  today.setUTCFullYear(local.year, local.month - 1, local.day);
  today.setUTCHours(0, 0, 0, 0);

  for (let offset = 0; offset < 2; offset += 1) {
    const day = checkedDate(today.getTime() + offset * DAY);
    const candidate = dailyOccurrence(day, targetMinute);

    if (candidate.getTime() > after.getTime()) {
      return candidate;
    }
  }

  throw new Error('No se pudo calcular la próxima ejecución');
}
