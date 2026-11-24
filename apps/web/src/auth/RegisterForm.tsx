import { useState, type SubmitEvent } from 'react'
import { register } from './auth-client'

interface RegisterFormProps {
  onRegistered: (email: string) => void
  onBack: () => void
}

export default function RegisterForm({ onRegistered, onBack }: RegisterFormProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const data = new FormData(form)
    const email = data.get('email')
    const password = data.get('password')

    if (typeof email !== 'string' || typeof password !== 'string') return
    if (password !== data.get('confirmation')) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setPending(true)
    setError(null)
    try {
      await register({ email, password })
      form.reset()
      onRegistered(email.trim().toLowerCase())
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) && !(cause instanceof DOMException) && !(cause instanceof SyntaxError)
        ? cause.message : 'No se pudo crear la cuenta. Inténtalo de nuevo.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} aria-busy={pending}>
      <div className="form-field">
        <label htmlFor="register-email">Correo electrónico</label>
        <input id="register-email" name="email" type="email" autoComplete="username"
          maxLength={254} required disabled={pending} />
      </div>
      <div className="form-field">
        <label htmlFor="register-password">Contraseña</label>
        <input id="register-password" name="password" type="password" autoComplete="new-password"
          minLength={8} maxLength={128} required disabled={pending} aria-describedby="password-hint" />
        <p id="password-hint" className="field-hint">Entre 8 y 128 caracteres. Puedes usar una frase.</p>
      </div>
      <div className="form-field">
        <label htmlFor="register-confirmation">Repite la contraseña</label>
        <input id="register-confirmation" name="confirmation" type="password" autoComplete="new-password"
          minLength={8} maxLength={128} required disabled={pending} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>
      <button className="secondary-button" type="button" disabled={pending} onClick={onBack}>
        Ya tengo cuenta
      </button>
    </form>
  )
}
