import { useEffect, useState, type SubmitEvent } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import {
  getReminderSettings,
  saveReminderSettings,
} from './automation-client'
import type { ReminderSettingsInput } from './automation.types'

interface Props {
  onSessionExpired: () => void
}

export default function ReminderSettingsPanel({
  onSessionExpired,
}: Props) {
  const [form, setForm] = useState<ReminderSettingsInput | null>(null)
  const [saved, setSaved] = useState<ReminderSettingsInput | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getReminderSettings(controller.signal)
      .then(({ settings }) => {
        if (controller.signal.aborted) return

        const initial: ReminderSettingsInput = {
          enabled: settings?.enabled ?? false,
          lead_minutes: settings?.lead_minutes ?? 1440,
        }

        setForm(initial)
        setSaved(initial)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return

        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }

        setError('No se pudo cargar la configuración de recordatorios.')
      })

    return () => controller.abort()
  }, [retry, onSessionExpired])

  const dirty = form !== null && saved !== null && (
    form.enabled !== saved.enabled ||
    form.lead_minutes !== saved.lead_minutes
  )

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form || pending || !dirty) return

    setPending(true)
    setError(null)
    setNotice(null)

    try {
      const result = await saveReminderSettings(form)
      const updated: ReminderSettingsInput = {
        enabled: result.enabled,
        lead_minutes: result.lead_minutes,
      }

      setForm(updated)
      setSaved(updated)
      setNotice('Configuración guardada.')
    } catch (cause: unknown) {
      if (cause instanceof SessionExpiredError) {
        onSessionExpired()
        return
      }

      setError(
        'No se pudo confirmar el guardado. Vuelve a intentarlo.',
      )
    } finally {
      setPending(false)
    }
  }

  function changeForm(next: ReminderSettingsInput) {
    setForm(next)
    setNotice(null)
    setError(null)
  }

  return (
    <section
      className="automation-card"
      aria-labelledby="reminder-settings-title"
      aria-busy={form === null && error === null || pending}
    >
      <h2 id="reminder-settings-title">Recordatorios de entregas</h2>
      <p className="automation-description">
        Recibe un aviso antes de que venzan tus entregas pendientes.
      </p>

      {form === null ? (
        error ? (
          <>
            <p className="form-error" role="alert">{error}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setError(null)
                setRetry((value) => value + 1)
              }}
            >
              Reintentar
            </button>
          </>
        ) : (
          <p role="status">Cargando configuración…</p>
        )
      ) : (
        <form
          className="automation-form"
          onSubmit={handleSubmit}
        >
          <label className="automation-toggle">
            <input
              type="checkbox"
              checked={form.enabled}
              disabled={pending}
              onChange={(event) => changeForm({
                ...form,
                enabled: event.currentTarget.checked,
              })}
            />
            <span>Activar recordatorios</span>
          </label>

          <div className="form-field">
            <label htmlFor="reminder-lead">
              Antelación para entregas con hora
            </label>
            <select
              id="reminder-lead"
              value={form.lead_minutes}
              disabled={pending}
              onChange={(event) => changeForm({
                ...form,
                lead_minutes: event.currentTarget.value === '60'
                  ? 60
                  : 1440,
              })}
            >
              <option value="60">1 hora antes</option>
              <option value="1440">24 horas antes</option>
            </select>
          </div>

          <p className="automation-description">
            Las entregas sin hora se recuerdan a las 09:00 de Madrid
            del día anterior. Las entregadas o retiradas no generan
            nuevos avisos.
          </p>

          {error && (
            <p className="form-error" role="alert">{error}</p>
          )}

          {notice && (
            <p className="automation-notice" role="status">
              {notice}
            </p>
          )}

          <div className="automation-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={pending || !dirty}
            >
              {pending ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {dirty && !pending && (
              <span>Cambios sin guardar</span>
            )}
          </div>
        </form>
      )}
    </section>
  )
}