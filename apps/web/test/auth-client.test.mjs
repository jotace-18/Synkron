import assert from 'node:assert/strict'
import test from 'node:test'
import { getSession, login, logout, register } from '../src/auth/auth-client.ts'

const session = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'test@example.com',
  },
  expires_at: '2030-01-01T00:00:00.000Z',
}

const credentials = {
  email: 'test@example.com',
  password: 'Una-clave-ficticia-de-test',
}

function mockFetch(t, responses) {
  const original = globalThis.fetch
  const pending = [...responses]
  const calls = []

  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    const response = pending.shift()
    assert.ok(response, 'Petición inesperada')
    return response
  }

  return calls
}

test('distinguishes an absent session from an unavailable authentication service', async (t) => {
  mockFetch(t, [
    new Response(null, { status: 401 }),
    new Response(null, { status: 503 }),
  ])

  assert.equal(await getSession(), null)
  await assert.rejects(getSession(), /No se pudo comprobar tu sesión/)
})

test('registers with a fresh CSRF context without logging in and reports duplicate email safely', async (t) => {
  const calls = mockFetch(t, [
    Response.json({ csrf_token: 'register-context' }),
    Response.json({ id: 'created-account' }, { status: 201 }),
    Response.json({ csrf_token: 'duplicate-context' }),
    Response.json({ message: 'private-database-detail' }, { status: 409 }),
  ])
  await register(credentials)
  await assert.rejects(register(credentials), { message: 'El correo ya está registrado.' })
  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/v1/auth/csrf', '/api/v1/auth/register', '/api/v1/auth/csrf', '/api/v1/auth/register',
  ])
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'register-context')
  assert.deepEqual(JSON.parse(calls[1].options.body), credentials)
  assert.equal(calls[3].options.headers['X-CSRF-Token'], 'duplicate-context')
})

test('uses a fresh CSRF context for each write and accepts an empty logout response', async (t) => {
  const calls = mockFetch(t, [
    Response.json({ csrf_token: 'before-login' }),
    Response.json(session),
    Response.json({ csrf_token: 'after-login' }),
    new Response(null, { status: 204 }),
  ])

  assert.deepEqual(await login(credentials), session)
  await logout()

  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/v1/auth/csrf', '/api/v1/auth/login',
    '/api/v1/auth/csrf', '/api/v1/auth/logout',
  ])
  assert.equal(calls[1].options.method, 'POST')
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'before-login')
  assert.deepEqual(JSON.parse(calls[1].options.body), credentials)
  assert.equal(calls[3].options.method, 'POST')
  assert.equal(calls[3].options.headers['X-CSRF-Token'], 'after-login')
  assert.ok(calls.every(({ options }) => options.credentials === 'same-origin'))
  assert.ok(calls.every(({ options }) => options.cache === 'no-store'))
})

test('reports invalid credentials and rate limiting without exposing server details or retrying automatically', async (t) => {
  const calls = mockFetch(t, [
    Response.json({ csrf_token: 'first-context' }),
    Response.json({ message: 'private-detail' }, { status: 401 }),
    Response.json({ csrf_token: 'second-context' }),
    new Response(null, { status: 429 }),
  ])

  await assert.rejects(login(credentials), { message: 'Correo o contraseña incorrectos.' })
  await assert.rejects(login(credentials), /Demasiados intentos/)
  assert.equal(calls.length, 4)
})
