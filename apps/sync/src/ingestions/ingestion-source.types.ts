import type { ActivityType } from '../activities/activity.types';
import type { ActivityImportContext } from '../imports/activity-import.validation';

export interface IngestionSourceView {
  id: string;
  name: string;
  source_connection_id: string;
  definition_id: string;
  source_collection: string;
  allowed_types: ActivityType[];
  enabled: boolean;
  revoked: boolean;
  created_at: Date;
  updated_at: Date;
}
export interface IngestionPrincipal extends ActivityImportContext {
  source_id: string;
  definition_id: string;
  token_hash: string;
  enabled: boolean;
  definition_enabled: boolean;
  connection_enabled: boolean;
}
