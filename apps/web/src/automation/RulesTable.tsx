import type { AutomationRule } from './automation.types'
import {
  NOTIFICATION_RULE_PRESETS,
  readNotificationRule,
} from './notification-rule-presets'

interface Props {
  rules: AutomationRule[]
  pendingId: string | null
  onEdit: (rule: AutomationRule) => void
  onToggle: (rule: AutomationRule) => void
}

const eventLabels = {
  'data.changed': 'Cambian los datos de una actividad',
  'sync.completed': 'Una sincronización termina correctamente',
  'sync.failed': 'Una sincronización falla',
}

export default function RulesTable({
  rules,
  pendingId,
  onEdit,
  onToggle,
}: Props) {
  if (rules.length === 0) {
    return (
      <p className="automation-description">
        Todavía no hay reglas en esta página.
      </p>
    )
  }

  return (
    <div className="automation-table-scroll">
      <table
        className="automation-table"
        aria-label="Reglas de automatización"
        aria-busy={pendingId !== null}
      >
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Cuándo</th>
            <th scope="col">Acción</th>
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>

        <tbody>
          {rules.map((rule) => {
            const editable = readNotificationRule(rule)

            const preset = NOTIFICATION_RULE_PRESETS.find(
              (item) => item.value === editable?.preset,
            )

            return (
              <tr key={rule.id}>
                <th scope="row">{rule.name}</th>
                <td>{preset?.label ?? eventLabels[rule.trigger.event_type]}</td>
                <td>
                  <div className="automation-rule-summary">
                    {rule.actions.map((action, index) => (
                      <p key={index}>
                        {action.type === 'notify'
                          ? action.message
                          : 'Iniciar una sincronización'}
                      </p>
                    ))}
                  </div>
                </td>
                <td>
                  <span
                    className={`automation-badge ${
                      rule.enabled
                        ? 'automation-badge--active'
                        : 'automation-badge--paused'
                    }`}
                  >
                    {rule.enabled ? 'Activa' : 'Pausada'}
                  </span>
                </td>
                <td>
                  <div className="automation-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={pendingId !== null || !editable}
                      title={
                        !editable
                          ? 'El formulario todavía no admite esta configuración.'
                          : undefined
                      }
                      aria-label={`Editar ${rule.name}`}
                      onClick={() => onEdit(rule)}
                    >
                      Editar
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={pendingId !== null}
                      aria-label={`${
                        rule.enabled ? 'Pausar' : 'Activar'
                      } ${rule.name}`}
                      onClick={() => onToggle(rule)}
                    >
                      {pendingId === rule.id
                        ? 'Guardando…'
                        : rule.enabled
                          ? 'Pausar'
                          : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
