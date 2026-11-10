import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDefinitionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsUUID('4')
  source_connection_id!: string;

  @Equals('academic.assignments')
  connector!: 'academic.assignments';

  @IsBoolean()
  enabled: boolean = true;
}
