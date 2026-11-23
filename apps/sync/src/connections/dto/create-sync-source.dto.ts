import { IsIn } from 'class-validator';
import { CreateConnectionDto } from './create-connection.dto';
import {
  CONNECTOR_NAMES,
  type ConnectorName,
} from '../../connectors/connector-catalog';

export class CreateSyncSourceDto extends CreateConnectionDto {
  @IsIn(CONNECTOR_NAMES)
  connector!: ConnectorName;
}
