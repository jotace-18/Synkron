import type { SyncConnection, SyncDefinition, SyncRun } from './sync-client.ts'
import type { BatchEntry } from './sync-batch.ts'
import { SOURCE_PRESETS } from './source-presets.ts'
export type SyncGroup = NonNullable<SyncDefinition['group']>
export const SYNC_GROUPS: { id: SyncGroup; label: string }[] = [
  { id: 'academic', label: 'Académico' },
  { id: 'sport', label: 'Deporte' },
  { id: 'personal', label: 'Otros' },
  { id: 'custom', label: 'Otras fuentes' },
]
function canonicalTarget(address: string): string | null {
  try {
    const url = new URL(address)
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return null
  }
}
export function assignSyncGroups(
  definitions: SyncDefinition[],
  connections: SyncConnection[],
): SyncDefinition[] {
  const addresses = new Map(
    connections.map(({ id, base_url }) => [id, canonicalTarget(base_url)]),
  )
  return definitions.map((definition) => {
    let group: SyncGroup = 'custom'
    if (definition.connector.startsWith('academic.')) group = 'academic'
    else if (definition.connector === 'standard.activities') {
      const address = addresses.get(definition.source_connection_id)
      if (address === canonicalTarget(SOURCE_PRESETS.sport.url)) group = 'sport'
      else if (address === canonicalTarget(SOURCE_PRESETS.personal.url))
        group = 'personal'
    }
    return { ...definition, group }
  })
}
export function definitionsForGroup(
  definitions: SyncDefinition[],
  group: string,
): SyncDefinition[] {
  return [
    ...new Map(
      definitions
        .filter(
          (definition) =>
            definition.enabled &&
            (group === 'all' || definition.group === group),
        )
        .map((definition) => [definition.id, definition]),
    ).values(),
  ]
}
export function batchGroups(entries: BatchEntry[]) {
  return SYNC_GROUPS.map((group) => ({
    ...group,
    entries: entries.filter(
      ({ definition }) => (definition.group ?? 'custom') === group.id,
    ),
  })).filter(({ entries }) => entries.length > 0)
}
export function groupResult(
  entries: BatchEntry[],
  runs: Record<string, SyncRun>,
) {
  const result = {
    read_count: 0,
    created_count: 0,
    updated_count: 0,
    unchanged_count: 0,
    retired_count: 0,
    ignored_count: 0,
  }
  let terminalCount = 0
  let failed = false
  for (const entry of entries) {
    const run = entry.receipt ? runs[entry.receipt.id] : undefined
    if (run?.status === 'completed' || run?.status === 'failed') {
      terminalCount++
      failed ||= run.status === 'failed'
      for (const key of Object.keys(result) as (keyof typeof result)[])
        result[key] += run[key]
    }
  }
  const status = entries.some(({ error }) => error)
    ? 'Solicitudes sin confirmar'
    : entries.some(({ receipt }) => !receipt)
      ? 'Preparando solicitudes…'
      : terminalCount < entries.length
        ? 'Sincronizando…'
        : failed
          ? 'Terminada con incidencias'
          : 'Completada'
  return { status, terminalCount, counts: result }
}
