import { useEffect, useState } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import { listDefinitions, type SyncDefinition } from '../sync/sync-client'
import { listRules, saveRule, RULE_PAGE_SIZE } from './automation-client'
import type { AutomationRule } from './automation.types'
import NotificationRuleForm from './NotificationRuleForm'
import RulesTable from './RulesTable'

interface Props {
  onSessionExpired: () => void
}

interface ListResult {
  version: string
  rules: AutomationRule[]
  error: string | null
}

export default function RulesPanel({ onSessionExpired }: Props) {
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<ListResult | null>(null)
  const [definitions, setDefinitions] = useState<SyncDefinition[] | null>(null)
  const [definitionError, setDefinitionError] = useState<string | null>(null)
  const [definitionRetry, setDefinitionRetry] = useState(0)
  const [editing, setEditing] = useState<AutomationRule | 'new' | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const version = `${offset}/${retry}`
  const current = result?.version === version ? result : null
  const loading = current === null
  const busy = pendingId !== null

  useEffect(() => {
    const controller = new AbortController()

    listRules(offset, controller.signal)
      .then((rules) => {
        if (controller.signal.aborted) return
        setResult({ version, rules, error: null })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return

        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }

        setResult({
          version,
          rules: [],
          error: 'No se pudieron cargar las reglas.',
        })
      })

    return () => controller.abort()
  }, [offset, version, onSessionExpired])

  useEffect(() => {
    const controller = new AbortController()

    listDefinitions(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setDefinitions(items)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return

        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }

        setDefinitionError(
          'No se pudieron cargar las sincronizaciones disponibles.',
        )
      })

    return () => controller.abort()
  }, [definitionRetry, onSessionExpired])

  function refreshDefinitions() {
    setDefinitions(null)
    setDefinitionError(null)
    setDefinitionRetry((value) => value + 1)
  }

  function openEditor(rule: AutomationRule | 'new') {
    setActionError(null)
    setNotice(null)
    setEditing(rule)
  }

  function handleSaved() {
    setEditing(null)
    setOffset(0)
    setRetry((value) => value + 1)
    setNotice('Regla guardada.')
  }

  async function handleToggle(rule: AutomationRule) {
    if (busy || loading || editing !== null) return

    setPendingId(rule.id)
    setActionError(null)
    setNotice(null)

    try {
      await saveRule({ ...rule, enabled: !rule.enabled }, rule.id)

      setNotice(rule.enabled ? 'Regla pausada.' : 'Regla activada.')
      setRetry((value) => value + 1)
    } catch (cause: unknown) {
      if (cause instanceof SessionExpiredError) {
        onSessionExpired()
        return
      }

      setActionError(
        cause instanceof Error &&
          !(cause instanceof TypeError) &&
          !(cause instanceof SyntaxError) &&
          !(cause instanceof DOMException)
          ? cause.message
          : 'No se pudo confirmar el cambio. Actualiza el listado.',
      )
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="automation-card" aria-labelledby="rules-title">
      <div className="automation-heading">
        <div>
          <h2 id="rules-title">Reglas por eventos</h2>
          <p className="automation-description">
            Elige qué cambios y resultados deben generar un aviso o iniciar una
            sincronización.
          </p>
        </div>

        <div className="automation-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={loading || busy || editing !== null}
            onClick={() => {
              setActionError(null)
              setNotice(null)
              setRetry((value) => value + 1)
              refreshDefinitions()
            }}
          >
            Actualizar
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={loading || busy || editing !== null}
            onClick={() => openEditor('new')}
          >
            Nueva regla
          </button>
        </div>
      </div>

      {notice && (
        <p className="automation-notice" role="status">
          {notice}
        </p>
      )}

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      {editing !== null &&
        (definitionError ? (
          <div className="automation-form">
            <p className="form-error" role="alert">
              {definitionError}
            </p>
            <div className="automation-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={refreshDefinitions}
              >
                Reintentar
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setEditing(null)}
              >
                Volver al listado
              </button>
            </div>
          </div>
        ) : definitions === null ? (
          <div className="automation-form">
            <p role="status">Cargando sincronizaciones…</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setEditing(null)}
            >
              Volver al listado
            </button>
          </div>
        ) : (
          <NotificationRuleForm
            key={editing === 'new' ? 'new' : editing.id}
            definitions={definitions}
            initial={editing === 'new' ? undefined : editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
            onSessionExpired={onSessionExpired}
          />
        ))}

      {editing === null &&
        (loading ? (
          <p role="status">Cargando reglas…</p>
        ) : current.error ? (
          <p className="form-error" role="alert">
            {current.error}
          </p>
        ) : (
          <>
            <RulesTable
              rules={current.rules}
              pendingId={pendingId}
              onEdit={openEditor}
              onToggle={handleToggle}
            />

            <div className="automation-pagination">
              <button
                className="secondary-button"
                type="button"
                disabled={busy || offset === 0}
                onClick={() =>
                  setOffset((value) => Math.max(0, value - RULE_PAGE_SIZE))
                }
              >
                Anterior
              </button>
              <span>Página {offset / RULE_PAGE_SIZE + 1}</span>
              <button
                className="secondary-button"
                type="button"
                disabled={busy || current.rules.length < RULE_PAGE_SIZE}
                onClick={() => setOffset((value) => value + RULE_PAGE_SIZE)}
              >
                Siguiente
              </button>
            </div>
          </>
        ))}
    </section>
  )
}
