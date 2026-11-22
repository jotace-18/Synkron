import { CONNECTOR_NAMES } from '../../connectors/connector-catalog';
import type { ConnectorName } from '../../connectors/connector-catalog';
import { Transform } from 'class-transformer';
import {
  IsIn,
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

  @IsIn(CONNECTOR_NAMES)
  connector!: ConnectorName;

  @IsBoolean()
  enabled: boolean = true;
}
