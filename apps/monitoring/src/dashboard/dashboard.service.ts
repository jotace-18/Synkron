import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  DataChangedPayload,
  SyncFailedPayload,
  SyncResultPayload,
} from '../events/sync-event.types';
import type { ListMonitoringChangesDto } from './dto/list-monitoring-changes.dto';
import type { ListMonitoringRunsDto } from './dto/list-monitoring-runs.dto';
import type {
  MonitoringRunDetailView,
  MonitoringRunView,
  MonitoringSummaryView,
} from './monitoring-view.types';

type RunRow = {
  event_id: string;
  occurred_at: Date;
  received_at: Date;
} & (
  | {
      event_type: 'sync.completed';
      payload: SyncResultPayload;
    }
  | {
      event_type: 'sync.failed';
      payload: SyncFailedPayload;
    }
);

type SummaryRow = {
  completed_runs: number;
  failed_runs: number;
  created_changes: number;
  updated_changes: number;
  retired_changes: number;
} & (RunRow | { event_type: null });

type ChangeRow = {
  event_id: string;
  occurred_at: Date;
  received_at: Date;
  payload: DataChangedPayload;
};

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

  async listRuns(
    tenantId: string,
    query: ListMonitoringRunsDto,
  ): Promise<MonitoringRunView[]> {
    const eventType = query.status ? `sync.${query.status}` : null;

    const result = await this.database.query<RunRow>(
      `WITH results AS (
         SELECT DISTINCT ON (correlation_id)
           event_id,
           event_type,
           payload,
           occurred_at,
           received_at
         FROM monitoring.events
         WHERE tenant_id = $1
           AND event_type IN ('sync.completed', 'sync.failed')
         ORDER BY correlation_id, occurred_at DESC, event_id DESC
       )
       SELECT *
       FROM results
       WHERE ($2::text IS NULL OR event_type = $2::text)
       ORDER BY occurred_at DESC, event_id DESC
       LIMIT $3 OFFSET $4`,
      [tenantId, eventType, query.limit, query.offset],
    );

    return result.rows.map((row) => this.toRunView(row));
  }

  async getSummary(tenantId: string): Promise<MonitoringSummaryView> {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

    const result = await this.database.query<SummaryRow>(
      `WITH results AS (
         SELECT DISTINCT ON (correlation_id)
           event_id,
           event_type,
           payload,
           occurred_at,
           received_at
         FROM monitoring.events
         WHERE tenant_id = $1
           AND event_type IN ('sync.completed', 'sync.failed')
         ORDER BY correlation_id, occurred_at DESC, event_id DESC
       ),
       run_counts AS (
         SELECT
           (COUNT(*) FILTER (
             WHERE event_type = 'sync.completed'
           ))::integer AS completed_runs,
           (COUNT(*) FILTER (
             WHERE event_type = 'sync.failed'
           ))::integer AS failed_runs
         FROM results
         WHERE occurred_at >= $2 AND occurred_at < $3
       ),
       change_counts AS (
         SELECT
           (COUNT(*) FILTER (
             WHERE payload->>'change_type' = 'created'
           ))::integer AS created_changes,
           (COUNT(*) FILTER (
             WHERE payload->>'change_type' = 'updated'
           ))::integer AS updated_changes,
           (COUNT(*) FILTER (
             WHERE payload->>'change_type' = 'retired'
           ))::integer AS retired_changes
         FROM monitoring.events
         WHERE tenant_id = $1
           AND event_type = 'data.changed'
           AND occurred_at >= $2 AND occurred_at < $3
       ),
       latest AS (
         SELECT *
         FROM results
         ORDER BY occurred_at DESC, event_id DESC
         LIMIT 1
       )
       SELECT run_counts.*, change_counts.*, latest.*
       FROM run_counts
       CROSS JOIN change_counts
       LEFT JOIN latest ON true`,
      [tenantId, from, to],
    );

    const row = result.rows[0];

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      completed_runs: row.completed_runs,
      failed_runs: row.failed_runs,
      changes: {
        created: row.created_changes,
        updated: row.updated_changes,
        retired: row.retired_changes,
      },
      last_run: row.event_type === null ? null : this.toRunView(row),
    };
  }

  async getRun(
    tenantId: string,
    runId: string,
    query: ListMonitoringChangesDto,
  ): Promise<MonitoringRunDetailView> {
    const result = await this.database.query<RunRow>(
      `SELECT
         event_id,
         event_type,
         payload,
         occurred_at,
         received_at
       FROM monitoring.events
       WHERE tenant_id = $1
         AND correlation_id = $2
         AND event_type IN ('sync.completed', 'sync.failed')
       ORDER BY occurred_at DESC, event_id DESC
       LIMIT 1`,
      [tenantId, runId],
    );

    const run = result.rows[0];

    if (!run) {
      throw new NotFoundException('No se encontró la ejecución en Monitoring');
    }

    const changes = await this.database.query<ChangeRow>(
      `SELECT event_id, payload, occurred_at, received_at
       FROM monitoring.events
       WHERE tenant_id = $1
         AND correlation_id = $2
         AND event_type = 'data.changed'
       ORDER BY occurred_at, event_id
       LIMIT $3 OFFSET $4`,
      [tenantId, runId, query.limit + 1, query.offset],
    );

    const hasMore = changes.rows.length > query.limit;

    return {
      run: this.toRunView(run),
      changes: changes.rows.slice(0, query.limit).map((row) => ({
        ...row.payload,
        event_id: row.event_id,
        occurred_at: row.occurred_at.toISOString(),
        received_at: row.received_at.toISOString(),
      })),
      next_changes_offset: hasMore ? query.offset + query.limit : null,
    };
  }

  private toRunView(row: RunRow): MonitoringRunView {
    return {
      id: row.payload.sync_run_id,
      definition_id: row.payload.definition_id,
      status: row.event_type === 'sync.completed' ? 'completed' : 'failed',
      occurred_at: row.occurred_at.toISOString(),
      received_at: row.received_at.toISOString(),
      counts: row.payload.counts,
      error:
        row.event_type === 'sync.failed'
          ? {
              code: row.payload.error.code,
              message: row.payload.error.message,
            }
          : null,
    };
  }
}
