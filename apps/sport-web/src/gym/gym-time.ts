const madridClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function madridFields(instant: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    madridClock
      .formatToParts(new Date(instant))
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
function wallTime(instant: number): number {
  const parts = Object.fromEntries(
    madridClock
      .formatToParts(new Date(instant))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}
export function madridInstant(date: string, time: string): string {
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (
    !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(time) ||
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, 16) !== `${date}T${time}`
  ) {
    throw new Error("Indica una fecha y una hora válidas.");
  }
  let instant = wall;
  for (let attempt = 0; attempt < 3; attempt += 1)
    instant -= wallTime(instant) - wall;
  if (wallTime(instant) !== wall)
    throw new Error(
      "Esa hora no existe en Madrid por el cambio de horario. Elige otra hora.",
    );
  // Match Campus: choose the first occurrence of a repeated autumn hour.
  if (wallTime(instant - 3_600_000) === wall) instant -= 3_600_000;
  const value = new Date(instant).toISOString();
  if (!/^(?!0000)\d{4}-/.test(value))
    throw new Error("La fecha queda fuera del intervalo admitido.");
  return value;
}
export function sessionEnd(start: string, duration: number): string {
  const end = new Date(Date.parse(start) + duration * 60_000);
  if (
    !Number.isFinite(end.getTime()) ||
    !/^(?!0000)\d{4}-/.test(end.toISOString())
  )
    throw new Error("La duración deja el final fuera del intervalo admitido.");
  return end.toISOString();
}
export const dateLabel = (instant: string) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(instant));
export const timeLabel = (instant: string) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${minutes} min`;
}
