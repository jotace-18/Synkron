import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsTimeZone,
  IsUUID,
  Max,
  Min,
  IsDateString,
  Matches,
  Validate,
  ValidateIf,
} from 'class-validator';
import { ACTIVITY_TYPES, type ActivityType } from '../activity.types';
import { ActivityPeriodConstraint } from './activity-period.constraint';

export class ListActivitiesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  offset: number = 0;

  @IsOptional()
  @IsIn(ACTIVITY_TYPES)
  type?: ActivityType;

  @IsOptional()
  @IsUUID()
  source_connection_id?: string;

  @Matches(/^[A-Za-z]/, {
    message: 'timezone debe ser una zona IANA con nombre',
  })
  @IsTimeZone()
  timezone: string = 'Europe/Madrid';

  @ValidateIf(
    (query: ListActivitiesDto) =>
      query.from !== undefined || query.to !== undefined,
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @Validate(ActivityPeriodConstraint)
  from?: string;

  @ValidateIf(
    (query: ListActivitiesDto) =>
      query.from !== undefined || query.to !== undefined,
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  to?: string;
}
