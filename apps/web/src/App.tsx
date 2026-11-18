import './App.css'
import { useCallback, useEffect, useState } from 'react'
import ActivitiesList from './activities/ActivitiesList'
import ActivitiesCalendar from './activities/ActivitiesCalendar'
import ActivityDetails from './activities/ActivityDetails'
import { getSession, logout } from './auth/auth-client'
import type { AuthSession } from './auth/auth.types'
import LoginForm from './auth/LoginForm'
import RegisterForm from './auth/RegisterForm'
import SyncPanel from './sync/SyncPanel'

function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logoutPending, setLogoutPending] = useState(false)
  const [view, setView] = useState<'calendar' | 'agenda'>('calendar')
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)
  const [authView, setAuthView] = useState<'login' | 'register'>('login')
  const [prefilledEmail, setPrefilledEmail] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [sessionRetry, setSessionRetry] = useState(0)
  const [refreshVersion, setRefreshVersion] = useState(0)

  const closeActivity = useCallback(() => setSelectedActivityId(null), [])
  const refreshActivities = useCallback(() => setRefreshVersion((value) => value + 1), [])

  const handleSessionExpired = useCallback(() => {
    setSelectedActivityId(null)
    setSession(null)
    setError(null)
    setAuthView('login')
    setNotice('Tu sesión ha caducado. Inicia sesión de nuevo para continuar.')
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
        setError('No se pudo comprobar tu sesión. Inténtalo de nuevo.')
        setChecking(false)
      })

    return () => controller.abort()
  }, [sessionRetry])

  async function handleLogout() {
    if (logoutPending) return

    setLogoutPending(true)
    setError(null)

    try {
      await logout()
      setSelectedActivityId(null)
      setSession(null)
      setAuthView('login')
      setNotice(null)
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

            <SyncPanel
              key={`sync:${session.user.id}`}
              onSessionExpired={handleSessionExpired}
              onFinished={refreshActivities}
            />

            {view === 'calendar' ? (
              <ActivitiesCalendar
                key={`calendar:${session.user.id}`}
                onSessionExpired={handleSessionExpired}
                onSelect={setSelectedActivityId}
                refreshVersion={refreshVersion}
              />
            ) : (
              <ActivitiesList
                key={`agenda:${session.user.id}`}
                onSessionExpired={handleSessionExpired}
                onSelect={setSelectedActivityId}
                refreshVersion={refreshVersion}
              />
            )}
          </>
        ) : (
          <section className="access-panel" aria-labelledby="access-title">
            <p className="eyebrow">Tu agenda personal</p>
            <h1 id="access-title">{authView === 'register' ? 'Crea tu cuenta.' : 'Todo tu día, en un lugar.'}</h1>
            <p>{authView === 'register' ? 'Empieza a reunir tus actividades en Synkron.' : 'Inicia sesión para consultar tus actividades.'}</p>
            {notice && <p className="access-notice" role="status">{notice}</p>}

            {error ? (
              <>
                <p className="form-error" role="alert">{error}</p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setError(null)
                    setChecking(true)
                    setSessionRetry((value) => value + 1)
                  }}
                >
                  Reintentar
                </button>
              </>
            ) : authView === 'register' ? (
              <RegisterForm
                onBack={() => setAuthView('login')}
                onRegistered={(email) => {
                  setPrefilledEmail(email)
                  setNotice('Cuenta creada. Ya puedes iniciar sesión.')
                  setAuthView('login')
                }}
              />
            ) : (
              <LoginForm
                initialEmail={prefilledEmail}
                onRegister={() => { setNotice(null); setAuthView('register') }}
                onSuccess={(currentSession) => {
                  setNotice(null)
                  setError(null)
                  setSession(currentSession)
                }}
              />
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
