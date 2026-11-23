import assert from 'node:assert/strict'
import test from 'node:test'
import { getRun, listDefinitions, listSyncConnections, requestRun } from '../src/sync/sync-client.ts'
import { SessionExpiredError } from '../src/activities/activities-client.ts'

const run = {
  id: '11111111-1111-4111-8111-111111111111', status: 'completed',
  definition_id: '22222222-2222-4222-8222-222222222222',
  read_count: 2, created_count: 1, updated_count: 0,
  unchanged_count: 1, retired_count: 0, ignored_count: 0, error_message: null,
}

test('renews CSRF but retains the caller idempotency key when retrying an uncertain request', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/csrf')) return Response.json({ csrf_token: `context-${calls.length}` })
    if (calls.length === 2) throw new TypeError('Lost response')
    return Response.json({ id: run.id, status: 'queued' }, { status: 202 })
  })
  await assert.rejects(requestRun(run.definition_id, 'same-request-key'), TypeError)
  assert.deepEqual(await requestRun(run.definition_id, 'same-request-key'), { id: run.id, status: 'queued' })
  const writes = calls.filter(({ options }) => options.method === 'POST')
  assert.equal(writes.length, 2)
  assert.ok(writes.every(({ options }) => options.headers['Idempotency-Key'] === 'same-request-key'))
  assert.deepEqual(writes.map(({ options }) => options.headers['X-CSRF-Token']), ['context-1', 'context-3'])
  assert.ok(writes.every(({ options }) => options.body === '{}' && options.credentials === 'same-origin'))
})

test('reads a terminal result and distinguishes expired sessions from broken status queries', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1
    if (calls === 1) return Response.json(run)
    return new Response(null, { status: calls === 2 ? 401 : 503 })
  })
  assert.deepEqual(await getRun(run.id), run)
  await assert.rejects(getRun(run.id), SessionExpiredError)
  await assert.rejects(getRun(run.id), /puede seguir en curso/)
})

test('loads definition pages and stops an unauthorized read', async (t) => {
  const offsets = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    offsets.push(new URL(url, 'https://localhost').searchParams.get('offset'))
    if (offsets.length === 1) {
      return Response.json(Array.from({ length: 50 }, (_, id) => ({ id: String(id), name: 'Source', enabled: true, connector: 'academic.assignments', source_connection_id: 'connection' })))
    }
    if (offsets.length === 2) return Response.json([])
    return new Response(null, { status: 401 })
  })
  assert.equal((await listDefinitions()).length, 50)
  assert.deepEqual(offsets, ['0', '50'])
  await assert.rejects(listDefinitions(), SessionExpiredError)
})


test('loads owned connection metadata across pages and handles expired sessions', async (t) => {
  const offsets = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    offsets.push(new URL(url, 'https://localhost').searchParams.get('offset'))
    assert.equal(options.credentials, 'same-origin')
    if (offsets.length === 1) return Response.json(Array.from({length: 50}, (_, id) => ({id: String(id), base_url: 'http://personal:3000/api/v1/activities/export', has_credentials: true})))
    if (offsets.length === 2) return Response.json([])
    return new Response(null, {status: 401})
  })
  const connections = await listSyncConnections()
  assert.equal(connections.length, 50)
  assert.deepEqual(Object.keys(connections[0]).sort(), ['base_url', 'id'])
  assert.deepEqual(offsets, ['0', '50'])
  await assert.rejects(listSyncConnections(), SessionExpiredError)
})
