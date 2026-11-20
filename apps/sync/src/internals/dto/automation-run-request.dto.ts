import { IsUUID } from 'class-validator';

export class AutomationRunRequestDto {
  @IsUUID('4')
  tenant_id!: string;
}
