import {
  Equals,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class NoAuthDto {
  @Equals('none')
  type!: 'none';
}

export class BearerAuthDto {
  @Equals('bearer')
  type!: 'bearer';

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  @Matches(/^[A-Za-z0-9._~+/-]+=*$/)
  token!: string;
}
