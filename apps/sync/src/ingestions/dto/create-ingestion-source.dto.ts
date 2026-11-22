import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ACTIVITY_TYPES } from '../../activities/activity.types';
import type { ActivityType } from '../../activities/activity.types';
export class CreateIngestionSourceDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @IsString()
  @Matches(/^[a-z][a-z0-9._-]{0,99}$/)
  source_collection!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ACTIVITY_TYPES.length)
  @ArrayUnique()
  @IsIn(ACTIVITY_TYPES, { each: true })
  allowed_types!: ActivityType[];
}
export class SetIngestionSourceEnabledDto {
  @IsBoolean() enabled!: boolean;
}
