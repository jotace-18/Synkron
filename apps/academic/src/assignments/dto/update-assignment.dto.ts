import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
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

  @IsOptional()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  due_date?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(
    /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  due_at?: string | null;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(['individual', 'group'])
  work_mode?: 'individual' | 'group';

  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((member: unknown) =>
          typeof member === 'string' ? member.trim() : member,
        )
      : value,
  )
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  group_members?: string[];

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  weight_percent?: number | null;

  @IsOptional()
  @IsIn(['course', 'section'])
  weight_basis?: 'course' | 'section' | null;

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
