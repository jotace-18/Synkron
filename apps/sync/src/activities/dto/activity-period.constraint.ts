import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'activityPeriod', async: false })
export class ActivityPeriodConstraint implements ValidatorConstraintInterface {
  validate(from: unknown, args: ValidationArguments): boolean {
    const { to } = args.object as { to?: unknown };

    return typeof from === 'string' && typeof to === 'string' && from < to;
  }

  defaultMessage(): string {
    return 'from y to deben indicar un periodo con from anterior a to';
  }
}
