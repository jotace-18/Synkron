import type {
  ConnectorName,
  ConnectorSourceCollection,
} from '../connectors/connector-catalog';
export interface SyncDefinition {
  id: string;
  name: string;
  source_connection_id: string;
  connector: ConnectorName;
  source_collection: ConnectorSourceCollection;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}
