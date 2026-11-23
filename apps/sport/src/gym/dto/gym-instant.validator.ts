import {
  isISO8601,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'gymInstant', async: false })
export class GymInstantValidator implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (
      typeof value !== 'string' ||
      !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) ||
      !isISO8601(value, { strict: true, strictSeparator: true })
    )
      return false;
    const date = new Date(value);
    return (
      Number.isFinite(date.getTime()) &&
      date.getUTCFullYear() >= 1 &&
      date.getUTCFullYear() <= 9999
    );
  }

  defaultMessage(): string {
    return 'started_at debe ser una fecha y hora ISO válida con zona explícita y precisión máxima de milisegundos';
  }
}
