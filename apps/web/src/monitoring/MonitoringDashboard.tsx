import { useEffect, useState } from 'react'
import { SessionExpiredError } from '../activities/activities-client'
import {
  getMonitoringSummary,
  listMonitoringRuns,
} from './monitoring-client'
import MonitoringRunsTable from './MonitoringRunsTable'
import MonitoringSummaryCards from './MonitoringSummaryCards'
import type {
  MonitoringRun,
  MonitoringRunStatus,
  MonitoringSummary,
} from './monitoring.types'

type Props = {
  onSessionExpired: () => void
  onSelect: (id: string) => void
  refreshVersion?: number
}

type Result = {
  version: string
  summary: MonitoringSummary | null
  runs: MonitoringRun[]
  error: string | null
}

export default function MonitoringDashboard({
  onSessionExpired,
  onSelect,
  refreshVersion = 0,
}: Props) {
  const [status, setStatus] =
    useState<MonitoringRunStatus | 'all'>('all')
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  const version = `${status}/${offset}/${retry}/${refreshVersion}`
  const current = result?.version === version ? result : null
  const loading = current === null

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      getMonitoringSummary(controller.signal),
      listMonitoringRuns(status, offset, controller.signal),
    ])
      .then(([summary, runs]) => {
        if (controller.signal.aborted) return

        setResult({
          version,
          summary,
          runs,
          error: null,
        })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return

        if (cause instanceof SessionExpiredError) {
          onSessionExpired()
          return
        }

        setResult({
          version,
          summary: null,
          runs: [],
          error: 'No se pudo cargar el centro de mandos. Inténtalo de nuevo.',
        })
      })

    return () => controller.abort()
  }, [status, offset, version, onSessionExpired])

  return (
    <div className="monitoring-dashboard" aria-busy={loading}>
      <div className="monitoring-toolbar">
        <p>
          Los resultados pueden tardar unos segundos en aparecer.
          Horarios de Madrid.
        </p>
        <button
          className="secondary-button"
          type="button"
          disabled={loading}
          onClick={() => setRetry((value) => value + 1)}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {result?.summary && (
        <MonitoringSummaryCards summary={result.summary} />
      )}

      {current?.error ? (
        <p className="form-error" role="alert">
          {current.error}
        </p>
      ) : (
        <MonitoringRunsTable
          runs={current?.runs ?? []}
          status={status}
          offset={offset}
          loading={loading}
          onStatusChange={(nextStatus) => {
            setStatus(nextStatus)
            setOffset(0)
          }}
          onOffsetChange={setOffset}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}