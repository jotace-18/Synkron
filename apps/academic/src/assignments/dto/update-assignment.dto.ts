import {
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateAssignmentDto {
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
