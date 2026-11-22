import { useState, type SubmitEvent } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import type { SyncDefinition } from '../sync/sync-client'
import { saveSchedule } from './automation-client'
import type {
  AutomationSchedule,
  ScheduleInput,
} from './automation.types'

interface Props {
  definitions: SyncDefinition[]
  initial?: AutomationSchedule
  onSaved: (schedule: AutomationSchedule) => void
  onCancel: () => void
  onSessionExpired: () => void
}

export default function ScheduleForm({
  definitions,
  initial,
  onSaved,
  onCancel,
  onSessionExpired,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [definitionId, setDefinitionId] = useState(
    initial?.definition_id ??
    definitions.find((definition) => definition.enabled)?.id ??
    '',
  )
  const [kind, setKind] = useState<'interval' | 'daily'>(
    initial?.schedule_kind ?? 'interval',
  )
  const [interval, setInterval] = useState<15 | 30 | 60>(
    initial?.schedule_kind === 'interval'
      ? initial.interval_minutes
      : 15,
  )
  const [dailyTime, setDailyTime] = useState(
    initial?.schedule_kind === 'daily'
      ? initial.daily_time
      : '09:00',
  )
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availableDefinitions = definitions.filter(
    (definition) =>
      definition.enabled || definition.id === initial?.definition_id,
  )

  const missingOriginal = initial !== undefined &&
    !definitions.some(
      (definition) => definition.id === initial.definition_id,
    )

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !definitionId) return

    const common = {
      name: name.trim(),
      definition_id: definitionId,
      enabled,
    }

    if (!common.name) {
      setError('Escribe un nombre para la programación.')
      return
    }

    const input: ScheduleInput = kind === 'interval'
      ? {
          ...common,
          schedule_kind: 'interval',
          interval_minutes: interval,
          daily_time: null,
        }
      : {
          ...common,
          schedule_kind: 'daily',
          interval_minutes: null,
          daily_time: dailyTime,
        }

    setPending(true)
    setError(null)

    try {
      const result = await saveSchedule(input, initial?.id)
      onSaved(result)
    } catch (cause: unknown) {
      if (cause instanceof SessionExpiredError) {
        onSessionExpired()
        return
      }

      setError(
        cause instanceof Error &&
        !(cause instanceof TypeError) &&
        !(cause instanceof SyntaxError) &&
        !(cause instanceof DOMException)
          ? cause.message
          : 'No se pudo confirmar el guardado. Revisa el listado antes de repetir.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="automation-form automation-form--columns"
      onSubmit={handleSubmit}
      aria-busy={pending}
    >
      <h3>{initial ? 'Editar programación' : 'Nueva programación'}</h3>

      <div className="form-field">
        <label htmlFor="schedule-name">Nombre</label>
        <input
          id="schedule-name"
          type="text"
          value={name}
          maxLength={150}
          required
          disabled={pending}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="schedule-definition">Qué sincronizar</label>
        <select
          id="schedule-definition"
          value={definitionId}
          required
          disabled={pending}
          onChange={(event) =>
            setDefinitionId(event.currentTarget.value)
          }
        >
          {!definitionId && (
            <option value="">No hay sincronizaciones disponibles</option>
          )}

          {missingOriginal && (
            <option value={initial.definition_id}>
              Sincronización no disponible
            </option>
          )}

          {availableDefinitions.map((definition) => (
            <option
              key={definition.id}
              value={definition.id}
              disabled={!definition.enabled}
            >
              {definition.name}
              {!definition.enabled ? ' (desactivada)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="schedule-kind">Frecuencia</label>
        <select
          id="schedule-kind"
          value={kind}
          disabled={pending}
          onChange={(event) => setKind(
            event.currentTarget.value === 'daily' ? 'daily' : 'interval',
          )}
        >
          <option value="interval">Cada cierto tiempo</option>
          <option value="daily">Una vez al día</option>
        </select>
      </div>

      {kind === 'interval' ? (
        <div className="form-field">
          <label htmlFor="schedule-interval">Intervalo</label>
          <select
            id="schedule-interval"
            value={interval}
            disabled={pending}
            onChange={(event) => {
              const value = event.currentTarget.value
              setInterval(value === '30' ? 30 : value === '60' ? 60 : 15)
            }}
          >
            <option value="15">Cada 15 minutos</option>
            <option value="30">Cada 30 minutos</option>
            <option value="60">Cada hora</option>
          </select>
        </div>
      ) : (
        <div className="form-field">
          <label htmlFor="schedule-time">Hora de Madrid</label>
          <input
            id="schedule-time"
            type="time"
            value={dailyTime}
            step={60}
            required
            disabled={pending}
            onChange={(event) => setDailyTime(event.currentTarget.value)}
          />
        </div>
      )}

      <label className="automation-toggle">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
        <span>Activar programación</span>
      </label>

      <p className="automation-description">
        Si la dejas desactivada, se guardará en pausa.
        Los horarios diarios se interpretan en Madrid.
      </p>

      {error && (
        <p className="form-error" role="alert">{error}</p>
      )}

      <div className="automation-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={pending || !definitionId}
        >
          {pending ? 'Guardando…' : 'Guardar programación'}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={pending}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
