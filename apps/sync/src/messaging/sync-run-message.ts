import { isUUID } from 'class-validator';

export const SYNC_RUN_QUEUE = 'synkron.sync.runs.v1';

export interface SyncRunMessage {
  schema_version: 1;
  run_id: string;
  tenant_id: string;
}

export function parseSyncRunMessage(value: unknown): SyncRunMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Mensaje de ejecución no válido');
  }

  const message = value as Record<string, unknown>;
  const allowedKeys = ['schema_version', 'run_id', 'tenant_id'];
  const keys = Object.keys(message);

  if (
    keys.length !== allowedKeys.length ||
    !keys.every((key) => allowedKeys.includes(key)) ||
    message.schema_version !== 1 ||
    typeof message.run_id !== 'string' ||
    !isUUID(message.run_id, '4') ||
    typeof message.tenant_id !== 'string' ||
    !isUUID(message.tenant_id, '4')
  ) {
    throw new Error('Mensaje de ejecución no válido');
  }

  return {
    schema_version: 1,
    run_id: message.run_id.toLowerCase(),
    tenant_id: message.tenant_id.toLowerCase(),
  };
}
