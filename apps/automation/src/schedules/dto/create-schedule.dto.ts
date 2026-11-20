import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateScheduleDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsUUID('4')
  definition_id!: string;

  @IsBoolean()
  enabled: boolean = true;

  @IsIn(['interval', 'daily'])
  schedule_kind!: 'interval' | 'daily';

  @IsOptional()
  @IsInt()
  @IsIn([15, 30, 60])
  interval_minutes: 15 | 30 | 60 | null = null;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  daily_time: string | null = null;
}
