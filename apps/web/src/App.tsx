import './App.css'
import { useCallback, useEffect, useState } from 'react'
import ActivitiesList from './activities/ActivitiesList'
import ActivitiesCalendar from './activities/ActivitiesCalendar'
import ActivityDetails from './activities/ActivityDetails'
import { getSession, logout } from './auth/auth-client'
import type { AuthSession } from './auth/auth.types'
import LoginForm from './auth/LoginForm'

function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logoutPending, setLogoutPending] = useState(false)
  const [view, setView] = useState<'calendar' | 'agenda'>('calendar')
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  const closeActivity = useCallback(() => setSelectedActivityId(null), [])

  const handleSessionExpired = useCallback(() => {
    setSelectedActivityId(null)
    setSession(null)
    setError(null)
  }, [])

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
      setSelectedActivityId(null)
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
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span className="brand-name">Synkron</span>
        </div>
        {session && (
          <div className="account-menu">
            <span className="account-email" title={session.user.email}>
              {session.user.email}
            </span>
            <button
              className="secondary-button"
              type="button"
              onClick={handleLogout}
              disabled={logoutPending}
            >
              {logoutPending ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        )}
      </header>

      <main className={session ? 'workspace' : 'access-layout'}>
        {checking ? (
          <p role="status">Comprobando tu sesión…</p>
        ) : session ? (
          <>
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">Tu agenda personal</p>
                <h1>{view === 'calendar' ? 'Tu calendario' : 'Tu agenda'}</h1>
                <p className="workspace-description">
                  Entregas, entrenamientos y planes en una misma vista.
                </p>
              </div>
              <div className="view-switch" role="group" aria-label="Vista de actividades">
                <button
                  type="button"
                  aria-pressed={view === 'calendar'}
                  onClick={() => setView('calendar')}
                >
                  Calendario
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'agenda'}
                  onClick={() => setView('agenda')}
                >
                  Agenda
                </button>
              </div>
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}

            {view === 'calendar' ? (
              <ActivitiesCalendar
                key={session.user.id}
                onSessionExpired={handleSessionExpired}
                onSelect={setSelectedActivityId}
              />
            ) : (
              <ActivitiesList
                key={session.user.id}
                onSessionExpired={handleSessionExpired}
                onSelect={setSelectedActivityId}
              />
            )}
          </>
        ) : (
          <section className="access-panel" aria-labelledby="access-title">
            <p className="eyebrow">Tu agenda personal</p>
            <h1 id="access-title">Todo tu día, en un lugar.</h1>
            <p>Inicia sesión para consultar tus actividades.</p>

            {error ? (
              <>
                <p className="form-error" role="alert">{error}</p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => window.location.reload()}
                >
                  Recargar página
                </button>
              </>
            ) : (
              <LoginForm onSuccess={setSession} />
            )}
          </section>
        )}
      </main>
      {session && selectedActivityId && (
        <ActivityDetails
          key={selectedActivityId}
          activityId={selectedActivityId}
          onClose={closeActivity}
          onSessionExpired={handleSessionExpired}
        />
      )}
    </div>
  )
}

export default App
