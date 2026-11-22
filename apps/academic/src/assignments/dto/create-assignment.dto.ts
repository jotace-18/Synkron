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
  Validate,
} from 'class-validator';
import { AssignmentDeadlineValidator } from './assignment-deadline.validator';
import { AssignmentGroupMembersValidator } from './assignment-group-members.validator';
import { AssignmentWeightValidator } from './assignment-weight.validator';

export class CreateAssignmentDto {
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

  @IsIn(['theory', 'practice', 'seminar'])
  section!: 'theory' | 'practice' | 'seminar';

  @IsBoolean()
  mandatory!: boolean;

  @Validate(AssignmentDeadlineValidator)
  due_date?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(
    /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  due_at?: string | null;

  @IsIn(['pending', 'in_progress', 'submitted'])
  status: 'pending' | 'in_progress' | 'submitted' = 'pending';

  @IsIn(['individual', 'group'])
  work_mode: 'individual' | 'group' = 'individual';

  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((member: unknown) =>
          typeof member === 'string' ? member.trim() : member,
        )
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @Validate(AssignmentGroupMembersValidator)
  group_members: string[] = [];

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  weight_percent?: number | null;

  @Validate(AssignmentWeightValidator)
  weight_basis?: 'course' | 'section' | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10)
  grade?: number | null;
}
