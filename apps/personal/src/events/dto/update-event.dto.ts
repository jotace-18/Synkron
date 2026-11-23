import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
} from 'class-validator';
import { EVENT_STATUSES, type EventStatus } from '../event.types';
import {
  EventDayValidator,
  EventInstantValidator,
} from './event-time.validator';
import { trimPeople, trimText } from './create-event.dto';
export class UpdateEventDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ValidateIf(
    (_object: unknown, value: unknown) => value !== undefined && value !== null,
  )
  @Validate(EventDayValidator)
  on_date?: string | null;

  @ValidateIf(
    (_object: unknown, value: unknown) => value !== undefined && value !== null,
  )
  @Validate(EventInstantValidator)
  started_at?: string | null;

  @ValidateIf(
    (_object: unknown, value: unknown) => value !== undefined && value !== null,
  )
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  duration_minutes?: number | null;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimPeople)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  people?: string[];

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(EVENT_STATUSES)
  status?: EventStatus;
}
