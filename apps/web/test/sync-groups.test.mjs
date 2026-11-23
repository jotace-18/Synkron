import assert from 'node:assert/strict'
import test from 'node:test'
import { assignSyncGroups, definitionsForGroup, batchGroups, groupResult } from '../src/sync/sync-groups.ts'
import { createBatch, submitBatch } from '../src/sync/sync-batch.ts'

const definition = (id, connector, source_connection_id, enabled = true) => ({id, name: 'Nombre arbitrario', connector, source_connection_id, enabled})
const definitions = assignSyncGroups([
  definition('tasks', 'academic.assignments', 'academic'),
  definition('exams', 'academic.exams', 'academic'),
  definition('disabled', 'academic.exams', 'academic', false),
  definition('gym', 'standard.activities', 'sport'),
  definition('events', 'standard.activities', 'personal'),
  definition('custom', 'standard.activities', 'unknown'),
], [
  {id: 'sport', base_url: 'http://sport:3000/api/v1/activities/export/'},
  {id: 'personal', base_url: 'http://personal:3000/api/v1/activities/export'},
])

test('selects complete enabled blocks independently of names and keeps other sources in sync all', () => {
  assert.deepEqual(definitionsForGroup(definitions, 'academic').map(({id}) => id), ['tasks', 'exams'])
  assert.deepEqual(definitionsForGroup(definitions, 'sport').map(({id}) => id), ['gym'])
  assert.deepEqual(definitionsForGroup(definitions, 'personal').map(({id}) => id), ['events'])
  assert.deepEqual(definitionsForGroup(definitions, 'all').map(({id}) => id), ['tasks', 'exams', 'gym', 'events', 'custom'])
  assert.deepEqual(batchGroups(createBatch(definitions, 'batch')).map(({label}) => label), ['Académico', 'Deporte', 'Otros', 'Otras fuentes'])
})

test('retries an uncertain academic request without resubmitting accepted exams and aggregates block results', async () => {
  const entries = createBatch(definitionsForGroup(definitions, 'academic'), 'same-batch')
  const calls = []
  const send = async (id, key) => {
    calls.push([id, key])
    if (calls.length === 1) throw new TypeError('Lost response')
    return {id, status: 'queued'}
  }
  const signal = new AbortController().signal
  const exam = {id: 'exams', status: 'completed', read_count: 2, created_count: 1, updated_count: 0, unchanged_count: 1, retired_count: 0, ignored_count: 0}
  await submitBatch(entries, signal, () => {}, send)
  assert.equal(groupResult(entries, {exams: exam}).status, 'Solicitudes sin confirmar')
  await submitBatch(entries, signal, () => {}, send)
  assert.deepEqual(calls, [['tasks', 'same-batch:tasks'], ['exams', 'same-batch:exams'], ['tasks', 'same-batch:tasks']])
  assert.equal(groupResult(entries, {exams: exam}).terminalCount, 1)
  const result = groupResult(entries, {exams: exam, tasks: {...exam, id: 'tasks'}})
  assert.equal(result.status, 'Completada')
  assert.equal(result.counts.read_count, 4)
  assert.equal(result.counts.created_count, 2)
  assert.equal(groupResult(entries, {exams: exam, tasks: {...exam, status: 'failed'}}).status, 'Terminada con incidencias')
})
