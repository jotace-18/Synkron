import type { AuthSession, LoginCredentials } from './auth.types'

async function readSession(response: Response): Promise<AuthSession> {
  const body: unknown = await response.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !('user' in body) ||
    typeof body.user !== 'object' ||
    body.user === null ||
    !('id' in body.user) ||
    typeof body.user.id !== 'string' ||
    !('email' in body.user) ||
    typeof body.user.email !== 'string' ||
    !('expires_at' in body) ||
    typeof body.expires_at !== 'string' ||
    !Number.isFinite(Date.parse(body.expires_at))
  ) {
    throw new Error('El servicio de acceso ha devuelto una respuesta inesperada.')
  }

  return {
    user: {
      id: body.user.id,
      email: body.user.email,
    },
    expires_at: body.expires_at,
  }
}

export async function getSession(
  signal?: AbortSignal,
): Promise<AuthSession | null> {
  const response = await fetch('/api/v1/auth/session', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
  })

  if (response.status === 401) {
    return null
  }

  if (response.status !== 200) {
    throw new Error('No se pudo comprobar tu sesión. Inténtalo de nuevo.')
  }

  return readSession(response)
}

export async function getCsrfToken(signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signal ?? AbortSignal.timeout(10_000),
  })

  if (response.status !== 200) {
    throw new Error('No se pudo preparar la solicitud. Inténtalo de nuevo.')
  }

  const body: unknown = await response.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    !('csrf_token' in body) ||
    typeof body.csrf_token !== 'string' ||
    body.csrf_token.length === 0
  ) {
    throw new Error('No se pudo preparar la solicitud. Inténtalo de nuevo.')
  }

  return body.csrf_token
}

export async function login(
  credentials: LoginCredentials,
): Promise<AuthSession> {
  const csrfToken = await getCsrfToken()

  const response = await fetch('/api/v1/auth/login', {
    signal: AbortSignal.timeout(10_000),
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(credentials),
  })

  if (response.status === 401) {
    throw new Error('Correo o contraseña incorrectos.')
  }

  if (response.status === 429) {
    throw new Error('Demasiados intentos. Espera antes de volver a intentarlo.')
  }

  if (response.status !== 200) {
    throw new Error('No se pudo iniciar sesión. Inténtalo de nuevo.')
  }

  return readSession(response)
}

export async function logout(): Promise<void> {
  const csrfToken = await getCsrfToken()

  const response = await fetch('/api/v1/auth/logout', {
    signal: AbortSignal.timeout(10_000),
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: '{}',
  })

  if (response.status !== 204) {
    throw new Error('No se pudo cerrar la sesión. Inténtalo de nuevo.')
  }
}

export async function register(credentials: LoginCredentials): Promise<void> {
  const csrfToken = await getCsrfToken()
  const response = await fetch('/api/v1/auth/register', {
    signal: AbortSignal.timeout(10_000),
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(credentials),
  })

  if (response.status === 409) throw new Error('El correo ya está registrado.')
  if (response.status === 422) {
    throw new Error('Revisa el correo y utiliza una contraseña de entre 8 y 128 caracteres.')
  }
  if (response.status !== 201) throw new Error('No se pudo crear la cuenta. Inténtalo de nuevo.')
}
