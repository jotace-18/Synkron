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
export function trimText({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
export function trimPeople({ value }: { value: unknown }): unknown {
  return Array.isArray(value)
    ? value.map((item: unknown) =>
        typeof item === 'string' ? item.trim() : item,
      )
    : value;
}
export class CreateEventDto {
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @Validate(EventDayValidator)
  on_date: string | null = null;

  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @Validate(EventInstantValidator)
  started_at: string | null = null;

  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  duration_minutes: number | null = null;

  @Transform(trimPeople)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  people: string[] = [];

  @IsIn(EVENT_STATUSES)
  status: EventStatus = 'pending';
}
