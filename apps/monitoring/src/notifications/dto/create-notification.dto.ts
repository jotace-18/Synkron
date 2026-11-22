import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  CreateNotificationInput,
  ReminderNotificationSource,
  RuleNotificationSource,
} from '../notification.types';

class NotificationSourceDto {
  @IsIn(['rule', 'reminder'])
  kind!: 'rule' | 'reminder';
}

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

export class ReminderNotificationSourceDto implements ReminderNotificationSource {
  @IsIn(['reminder'])
  kind!: 'reminder';

  @IsUUID('4')
  reminder_id!: string;

  @IsUUID('4')
  activity_id!: string;

  @IsString()
  @MaxLength(80)
  @Matches(
    /^(?:date:\d{4}-\d{2}-\d{2}|instant:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/,
  )
  deadline_key!: string;
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
  @Type(() => NotificationSourceDto, {
    discriminator: {
      property: 'kind',
      subTypes: [
        { name: 'rule', value: RuleNotificationSourceDto },
        { name: 'reminder', value: ReminderNotificationSourceDto },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  source!: RuleNotificationSourceDto | ReminderNotificationSourceDto;
}
