export function isCalendarDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith('0000-')
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const pattern =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

  const match = pattern.exec(value);

  return (
    match !== null &&
    isCalendarDate(match[1]) &&
    Number.isFinite(Date.parse(value))
  );
}
