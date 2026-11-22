import { IsUUID, ValidateIf } from 'class-validator';

export class AutomationAccountDto {
  @IsUUID('4')
  tenant_id!: string;
}

export class AutomationRunRequestDto extends AutomationAccountDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  automation_action_id?: string;
}
