import { SessionExpiredError } from '../activities/activities-client.ts'
import {
  requestRun,
  type RunReference,
  type SyncDefinition,
} from './sync-client.ts'

export interface BatchEntry {
  definition: SyncDefinition
  key: string
  receipt?: RunReference
  error?: string
}
export function createBatch(
  definitions: SyncDefinition[],
  key = crypto.randomUUID(),
): BatchEntry[] {
  return definitions
    .filter(({ enabled }) => enabled)
    .map((definition) => ({ definition, key: `${key}:${definition.id}` }))
}
// Entries retain their keys and receipts across retries after an uncertain response.
export async function submitBatch(
  entries: BatchEntry[],
  signal: AbortSignal,
  changed: () => void,
  send = requestRun,
): Promise<void> {
  for (const entry of entries) {
    signal.throwIfAborted()
    if (entry.receipt) continue
    try {
      entry.receipt = await send(entry.definition.id, entry.key, signal)
      entry.error = undefined
    } catch (cause) {
      if (signal.aborted || cause instanceof SessionExpiredError) throw cause
      entry.error =
        cause instanceof Error &&
        !(cause instanceof TypeError) &&
        !(cause instanceof DOMException) &&
        !(cause instanceof SyntaxError)
          ? cause.message
          : 'No se pudo confirmar la solicitud. Reintenta sin duplicarla.'
    }
    changed()
  }
}
