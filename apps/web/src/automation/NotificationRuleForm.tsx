import { useState, type SubmitEvent } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import type { SyncDefinition } from '../sync/sync-client'
import { saveRule } from './automation-client'
import type { AutomationRule } from './automation.types'
import {
  NOTIFICATION_RULE_PRESETS,
  notificationRuleInput,
  readNotificationRule,
  type NotificationRuleFormValues,
} from './notification-rule-presets'

interface Props {
  definitions: SyncDefinition[]
  initial?: AutomationRule
  onSaved: (rule: AutomationRule) => void
  onCancel: () => void
  onSessionExpired: () => void
}

export default function NotificationRuleForm({
  definitions,
  initial,
  onSaved,
  onCancel,
  onSessionExpired,
}: Props) {
  const initialValues = initial ? readNotificationRule(initial) : null

  const [form, setForm] = useState<NotificationRuleFormValues>(
    initialValues ?? {
      name: '',
      enabled: false,
      preset: 'sync_completed',
      definition_id: '',
      message: '',
      action_type: 'notify',
      target_definition_id: '',
    },
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const syncEvent =
    form.preset === 'sync_completed' || form.preset === 'sync_failed'

  const missingDefinition =
    form.definition_id !== '' &&
    !definitions.some((definition) => definition.id === form.definition_id)

  const missingTarget =
    form.target_definition_id !== '' &&
    !definitions.some(
      (definition) => definition.id === form.target_definition_id,
    )

  function changeForm(next: NotificationRuleFormValues) {
    setForm(next)
    setError(null)
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || (initial && !initialValues)) return

    const input = notificationRuleInput(form)
    const action = input.actions[0]

    if (
      !input.name ||
      !action ||
      (action.type === 'notify' && !action.message) ||
      (action.type === 'start_sync' && !action.definition_id)
    ) {
      setError('Escribe un nombre y completa la acción de la regla.')
      return
    }

    setPending(true)
    setError(null)

    try {
      const result = await saveRule(input, initial?.id)
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

  if (initial && !initialValues) {
    return (
      <div className="automation-form">
        <p>
          Esta regla utiliza condiciones o acciones que este formulario todavía
          no permite editar.
        </p>
        <button className="secondary-button" type="button" onClick={onCancel}>
          Volver al listado
        </button>
      </div>
    )
  }

  return (
    <form
      className="automation-form automation-form--columns"
      onSubmit={handleSubmit}
      aria-busy={pending}
    >
      <h3>{initial ? 'Editar regla' : 'Nueva regla'}</h3>

      <div className="form-field">
        <label htmlFor="rule-name">Nombre</label>
        <input
          id="rule-name"
          type="text"
          value={form.name}
          maxLength={150}
          required
          disabled={pending}
          onChange={(event) =>
            changeForm({
              ...form,
              name: event.currentTarget.value,
            })
          }
        />
      </div>

      <div className="form-field">
        <label htmlFor="rule-preset">Cuándo avisar</label>
        <select
          id="rule-preset"
          value={form.preset}
          disabled={pending}
          onChange={(event) => {
            const preset = NOTIFICATION_RULE_PRESETS.find(
              (item) => item.value === event.currentTarget.value,
            )

            if (preset) {
              changeForm({ ...form, preset: preset.value })
            }
          }}
        >
          {NOTIFICATION_RULE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>

      {syncEvent && (
        <div className="form-field automation-field--wide">
          <label htmlFor="rule-definition">Sincronización</label>
          <select
            id="rule-definition"
            value={form.definition_id}
            disabled={pending}
            onChange={(event) =>
              changeForm({
                ...form,
                definition_id: event.currentTarget.value,
              })
            }
          >
            <option value="">Cualquier sincronización</option>

            {missingDefinition && (
              <option value={form.definition_id}>
                Sincronización no disponible
              </option>
            )}

            {definitions.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
                {!definition.enabled ? ' (desactivada)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-field automation-field--wide">
        <label htmlFor="rule-action">Qué hacer</label>
        <select
          id="rule-action"
          value={form.action_type}
          disabled={pending}
          onChange={(event) =>
            changeForm({
              ...form,
              action_type:
                event.currentTarget.value === 'start_sync'
                  ? 'start_sync'
                  : 'notify',
            })
          }
        >
          <option value="notify">Enviar un aviso</option>
          <option value="start_sync">Iniciar una sincronización</option>
        </select>
      </div>

      {form.action_type === 'start_sync' ? (
        <div className="form-field automation-field--wide">
          <label htmlFor="rule-target">Qué sincronización iniciar</label>
          <select
            id="rule-target"
            value={form.target_definition_id}
            required
            disabled={pending}
            onChange={(event) =>
              changeForm({
                ...form,
                target_definition_id: event.currentTarget.value,
              })
            }
          >
            <option value="">Selecciona una sincronización</option>
            {missingTarget && (
              <option value={form.target_definition_id}>
                Sincronización no disponible
              </option>
            )}
            {definitions.map((definition) => (
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
          <p className="automation-description">
            Las sincronizaciones iniciadas por reglas no pueden iniciar otras
            reglas de sincronización. Así se evitan cadenas repetidas.
          </p>
        </div>
      ) : (
        <div className="form-field automation-field--wide">
          <label htmlFor="rule-message">Texto del aviso</label>
          <textarea
            id="rule-message"
            value={form.message}
            maxLength={500}
            rows={3}
            required
            disabled={pending}
            onChange={(event) =>
              changeForm({
                ...form,
                message: event.currentTarget.value,
              })
            }
          />
        </div>
      )}

      <label className="automation-toggle">
        <input
          type="checkbox"
          checked={form.enabled}
          disabled={pending}
          onChange={(event) =>
            changeForm({
              ...form,
              enabled: event.currentTarget.checked,
            })
          }
        />
        <span>Activar regla</span>
      </label>

      <p className="automation-description">
        Las reglas sobre notas, vencimientos y entregas se evalúan cuando
        sincronizas los cambios de la fuente.
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="automation-actions">
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar regla'}
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
