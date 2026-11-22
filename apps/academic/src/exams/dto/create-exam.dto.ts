import { Transform } from 'class-transformer';
import {
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
} from 'class-validator';

export class CreateExamDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  course_name!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  course_abbreviation?: string | null;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  topics?: string | null;

  @IsIn(['theory', 'practice'])
  section!: 'theory' | 'practice';
  @IsOptional()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  exam_date?: string | null;
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(
    /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  exam_at?: string | null;

  @IsIn(['scheduled', 'completed', 'cancelled'])
  status: 'scheduled' | 'completed' | 'cancelled' = 'scheduled';
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  weight_percent?: number | null;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10)
  grade?: number | null;
  @IsOptional()
  @IsIn(['course', 'section'])
  weight_basis?: 'course' | 'section' | null;
}
