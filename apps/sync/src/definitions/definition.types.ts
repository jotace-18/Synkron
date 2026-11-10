export interface SyncDefinition {
  id: string;
  name: string;
  source_connection_id: string;
  connector: 'academic.assignments';
  source_collection: 'assignments';
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}
