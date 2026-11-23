import {
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function isInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    );
  if (!match || !isDay(match[1])) return false;
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() >= 1 &&
    date.getUTCFullYear() <= 9999
  );
}
@ValidatorConstraint({ name: 'eventDay', async: false })
export class EventDayValidator implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isDay(value);
  }
  defaultMessage() {
    return 'on_date debe ser un día válido YYYY-MM-DD entre los años 1 y 9999';
  }
}
@ValidatorConstraint({ name: 'eventInstant', async: false })
export class EventInstantValidator implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isInstant(value);
  }
  defaultMessage() {
    return 'started_at debe ser un instante válido con zona explícita y precisión máxima de milisegundos';
  }
}
