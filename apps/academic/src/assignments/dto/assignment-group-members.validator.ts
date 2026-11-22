import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'assignmentGroupMembers', async: false })
export class AssignmentGroupMembersValidator implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const input = args.object as { work_mode?: unknown };

    return (
      Array.isArray(value) &&
      (input.work_mode === 'group' ||
        (input.work_mode === 'individual' && value.length === 0))
    );
  }

  defaultMessage(): string {
    return 'Solo las entregas grupales pueden incluir integrantes';
  }
}
