import { IsBoolean, IsIn, IsInt } from 'class-validator';
import {
  REMINDER_LEAD_MINUTES,
  type ReminderLeadMinutes,
  type ReminderSettingsInput,
} from '../reminder.types';

export class UpdateReminderSettingsDto implements ReminderSettingsInput {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @IsIn(REMINDER_LEAD_MINUTES)
  lead_minutes!: ReminderLeadMinutes;
}
