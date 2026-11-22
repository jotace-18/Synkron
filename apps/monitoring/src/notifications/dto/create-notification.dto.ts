import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  CreateNotificationInput,
  RuleNotificationSource,
} from '../notification.types';

export class RuleNotificationSourceDto implements RuleNotificationSource {
  @IsIn(['rule'])
  kind!: 'rule';

  @IsUUID('4')
  rule_id!: string;

  @IsUUID('4')
  event_id!: string;

  @IsUUID('4')
  sync_run_id!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  activity_id?: string;
}

export class CreateNotificationDto implements CreateNotificationInput {
  @IsUUID('4')
  tenant_id!: string;

  @IsUUID('4')
  source_action_id!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => RuleNotificationSourceDto)
  source!: RuleNotificationSourceDto;
}
