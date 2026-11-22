import {
  isISO8601,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'assignmentDeadline', async: false })
export class AssignmentDeadlineValidator implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const input = args.object as {
      due_date?: unknown;
      due_at?: unknown;
    };

    const hasDate = input.due_date !== undefined && input.due_date !== null;
    const hasInstant = input.due_at !== undefined && input.due_at !== null;

    if (hasDate === hasInstant) {
      return false;
    }

    if (hasDate) {
      return (
        typeof input.due_date === 'string' &&
        /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(input.due_date) &&
        isISO8601(input.due_date, { strict: true })
      );
    }

    return true;
  }

  defaultMessage(): string {
    return 'Indica un vencimiento válido mediante due_date o due_at, exclusivamente uno de ellos';
  }
}
