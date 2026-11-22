import type { ImportResult } from './import.types';

export function emptyImportResult(
  connectionId: string,
  read: number,
): ImportResult {
  return {
    connection_id: connectionId,
    read,
    created: 0,
    updated: 0,
    unchanged: 0,
    retired: 0,
    ignored: 0,
  };
}
