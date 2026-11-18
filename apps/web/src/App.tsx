import './App.css'
import { useEffect, useState } from 'react'
import { getSession, logout } from './auth/auth-client'
import type { AuthSession } from './auth/auth.types'
import LoginForm from './auth/LoginForm'

function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logoutPending, setLogoutPending] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    getSession(controller.signal)
      .then((currentSession) => {
        if (controller.signal.aborted) return
        setSession(currentSession)
        setChecking(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setError('No se pudo comprobar tu sesión. Recarga la página.')
        setChecking(false)
      })

    return () => controller.abort()
  }, [])

  async function handleLogout() {
    if (logoutPending) return

    setLogoutPending(true)
    setError(null)

    try {
      await logout()
      setSession(null)
    } catch {
      setError('No se pudo cerrar la sesión. Inténtalo de nuevo.')
    } finally {
      setLogoutPending(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        <span className="brand-name">Synkron</span>
      </header>

      <main className="welcome">
        <p className="eyebrow">Tu agenda personal</p>

        <h1>Tus actividades, en un solo lugar.</h1>

        <p className="welcome-description">
          Una vista conjunta de tus entregas, entrenamientos y planes.
        </p>

        <ul className="activity-categories" aria-label="Tipos de actividad">
          <li className="category-academic">Académico</li>
          <li className="category-sport">Deporte</li>
          <li className="category-social">Planes</li>
        </ul>

        <section className="access-panel" aria-labelledby="access-title">
          <h2 id="access-title">
            {session ? 'Tu cuenta' : 'Accede a tu agenda'}
          </h2>

          {checking ? (
            <p role="status">Comprobando tu sesión…</p>
          ) : session ? (
            <>
              <p>
                Has iniciado sesión como <strong>{session.user.email}</strong>.
              </p>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button
                className="secondary-button"
                type="button"
                onClick={handleLogout}
                disabled={logoutPending}
              >
                {logoutPending ? 'Cerrando sesión…' : 'Cerrar sesión'}
              </button>
            </>
          ) : error ? (
            <>
              <p className="form-error" role="alert">
                {error}
              </p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => window.location.reload()}
              >
                Recargar página
              </button>
            </>
          ) : (
            <>
              <p>Inicia sesión para consultar tus actividades.</p>
              <LoginForm onSuccess={setSession} />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
