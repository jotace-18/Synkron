import type { ActivityInput } from './activity.types';

export interface ActivityView extends ActivityInput {
  id: string;
  created_at: string;
  updated_at: string;
  last_synced_at: string;
}
