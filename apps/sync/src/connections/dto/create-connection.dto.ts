import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsObject,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BearerAuthDto, NoAuthDto } from './connection-auth.dto';

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
  @Type(() => NoAuthDto, {
    discriminator: {
      property: 'type',
      subTypes: [
        { name: 'none', value: NoAuthDto },
        { name: 'bearer', value: BearerAuthDto },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  auth!: NoAuthDto | BearerAuthDto;

  @IsBoolean()
  enabled: boolean = true;
}
