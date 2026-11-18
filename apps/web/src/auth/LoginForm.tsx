import { useState, type SubmitEvent } from 'react'
import { login } from './auth-client'
import type { AuthSession } from './auth.types'

interface LoginFormProps {
  onSuccess: (session: AuthSession) => void
}

function LoginForm({ onSuccess }: LoginFormProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const form = event.currentTarget
    const data = new FormData(form)
    const email = data.get('email')
    const password = data.get('password')

    if (typeof email !== 'string' || typeof password !== 'string') {
      setError('Revisa el correo y la contraseña.')
      return
    }

    setPending(true)
    setError(null)

    try {
      const session = await login({ email, password })
      form.reset()
      onSuccess(session)
    } catch (error) {
      if (error instanceof TypeError || error instanceof SyntaxError) {
        setError('No se pudo completar el acceso. Inténtalo de nuevo.')
      } else {
        setError(
          error instanceof Error
            ? error.message
            : 'No se pudo iniciar sesión.',
        )
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="login-form"
      onSubmit={handleSubmit}
      aria-busy={pending}
    >
      <div className="form-field">
        <label htmlFor="login-email">Correo electrónico</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          maxLength={254}
          disabled={pending}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="login-password">Contraseña</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          disabled={pending}
          required
        />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <button
        className="primary-button"
        type="submit"
        disabled={pending}
      >
        {pending ? 'Entrando…' : 'Iniciar sesión'}
      </button>
    </form>
  )
}
export default LoginForm