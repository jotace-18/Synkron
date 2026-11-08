import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateAssignmentDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  course_name?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  course_abbreviation?: string | null;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(['theory', 'practice', 'seminar'])
  section?: 'theory' | 'practice' | 'seminar';

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  mandatory?: boolean;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(['pending', 'in_progress', 'submitted'])
  status?: 'pending' | 'in_progress' | 'submitted';

  @IsOptional()
  @IsNumber({
    maxDecimalPlaces: 2,
    allowNaN: false,
    allowInfinity: false,
  })
  @Min(0)
  @Max(10)
  grade?: number | null;
}
