import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDefined,
  IsObject,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class NoAuthDto {
  @Equals('none')
  type!: 'none';
}

export class CreateConnectionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(2048)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    require_tld: false,
    disallow_auth: true,
  })
  base_url!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => NoAuthDto)
  auth!: NoAuthDto;

  @IsBoolean()
  enabled: boolean = true;
}
