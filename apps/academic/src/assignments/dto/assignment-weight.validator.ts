import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'assignmentWeight', async: false })
export class AssignmentWeightValidator implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const input = args.object as { weight_percent?: unknown };
    const hasPercent =
      input.weight_percent !== undefined && input.weight_percent !== null;
    const hasBasis = value !== undefined && value !== null;

    if (!hasPercent && !hasBasis) {
      return true;
    }

    return (
      hasPercent && hasBasis && (value === 'course' || value === 'section')
    );
  }

  defaultMessage(): string {
    return 'La ponderación requiere porcentaje y referencia (course o section), o ambos vacíos';
  }
}
