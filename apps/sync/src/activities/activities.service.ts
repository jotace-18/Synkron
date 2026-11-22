import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { activityContentHash } from './activity-content-hash';
import type {
  ActivityInput,
  ActivityRetirement,
  ActivityRetirementResult,
  ActivitySaveResult,
  ActivityRunLease,
  ActivityType,
} from './activity.types';
import type { PoolClient } from 'pg';
import { RunLeaseLostError } from '../runs/run-lease';
import { createDataChangedEvent } from '../events/create-data-changed-event';
import { appendOutboxEvent } from '../events/event-outbox';
import type { DataChangedPayload } from '../events/sync-event.types';
import {
  changedActivityFields,
  type StoredActivityContent,
} from './activity-changes';
import type { ActivityView } from './activity-view.types';
import type { ListActivitiesDto } from './dto/list-activities.dto';
import { toActivityView, type ActivityRow } from './activity-view.mapper';

const activityViewColumns = `
  id, source_connection_id, source_collection, external_id,
  type, title, time_kind, time_role,
  on_date::text AS on_date, at, end_at,
  status, details, source_updated_at,
  created_at, updated_at, last_synced_at
`;

@Injectable()
export class ActivitiesService {
  constructor(private readonly database: DatabaseService) {}

  async list(
    tenantId: string,
    filters: ListActivitiesDto,
  ): Promise<ActivityView[]> {
    const result = await this.database.query<ActivityRow>(
      `SELECT ${activityViewColumns}
     FROM sync.activities
     WHERE tenant_id = $1
       AND deleted_at IS NULL
       AND ($2::text IS NULL OR type = $2::text)
       AND (
         $3::uuid IS NULL
         OR source_connection_id = $3::uuid
       )
       AND (
         $4::date IS NULL
         OR (
           time_kind = 'date'
           AND on_date >= $4::date
           AND on_date < $5::date
         )
         OR (
           time_kind = 'instant'
           AND at >= (
             $4::date::timestamp AT TIME ZONE $6::text
           )
           AND at < (
             $5::date::timestamp AT TIME ZONE $6::text
           )
         )
         OR (
           time_kind = 'interval'
           AND at < (
             $5::date::timestamp AT TIME ZONE $6::text
           )
           AND end_at > (
             $4::date::timestamp AT TIME ZONE $6::text
           )
         )
       )
     ORDER BY
       COALESCE(on_date, (at AT TIME ZONE $6::text)::date) ASC,
       CASE WHEN time_kind = 'date' THEN 0 ELSE 1 END ASC,
       at ASC NULLS FIRST,
       id ASC
     LIMIT $7 OFFSET $8`,
      [
        tenantId,
        filters.type ?? null,
        filters.source_connection_id ?? null,
        filters.from ?? null,
        filters.to ?? null,
        filters.timezone,
        filters.limit,
        filters.offset,
      ],
    );

    return result.rows.map(toActivityView);
  }

  async get(tenantId: string, activityId: string): Promise<ActivityView> {
    const result = await this.database.query<ActivityRow>(
      `SELECT ${activityViewColumns}
     FROM sync.activities
     WHERE tenant_id = $1
       AND id = $2
       AND deleted_at IS NULL`,
      [tenantId, activityId],
    );

    const activity = result.rows[0];

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return toActivityView(activity);
  }

  private async assertRunLease(
    client: PoolClient,
    tenantId: string,
    sourceConnectionId: string,
    sourceCollection: string,
    lease: ActivityRunLease,
  ): Promise<string | null> {
    await client.query(
      `SELECT id
     FROM sync.runs
     WHERE tenant_id = $1 AND id = $2
     FOR UPDATE`,
      [tenantId, lease.run_id],
    );

    const result = await client.query<{
      id: string;
      automation_action_id: string | null;
    }>(
      `SELECT id, automation_action_id
     FROM sync.runs
     WHERE tenant_id = $1
       AND id = $2
       AND claim_token = $3
       AND status = 'running'
       AND lease_expires_at > clock_timestamp()
       AND source_connection_id = $4
       AND source_collection = $5`,
      [
        tenantId,
        lease.run_id,
        lease.claim_token,
        sourceConnectionId,
        sourceCollection,
      ],
    );

    if (!result.rows[0]) {
      throw new RunLeaseLostError();
    }

    return result.rows[0].automation_action_id;
  }

  async save(
    tenantId: string,
    activity: ActivityInput,
    lease?: ActivityRunLease,
  ): Promise<ActivitySaveResult> {
    const hash = activityContentHash(activity);
    const eventSource = {
      source_connection_id: activity.source_connection_id,
      source_collection: activity.source_collection,
      activity_type: activity.type,
      external_id: activity.external_id,
    };

    const values = [
      tenantId,
      activity.source_connection_id,
      activity.source_collection,
      activity.external_id,
      activity.type,
      activity.title,
      activity.schedule.kind,
      activity.schedule.role,
      activity.schedule.date,
      activity.schedule.at,
      activity.schedule.end_at,
      activity.status,
      JSON.stringify(activity.details),
      activity.source_updated_at,
      hash,
    ];

    return this.database.transaction<ActivitySaveResult>(async (client) => {
      const automationActionId = lease
        ? await this.assertRunLease(
            client,
            tenantId,
            activity.source_connection_id,
            activity.source_collection,
            lease,
          )
        : null;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO sync.activities (
           tenant_id, source_connection_id, source_collection, external_id,
           type, title, time_kind, time_role, on_date, at, end_at,
           status, details, source_updated_at, content_hash
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9::date, $10::timestamptz, $11::timestamptz,
           $12, $13::jsonb, $14::timestamptz, $15
         )
         ON CONFLICT ON CONSTRAINT activities_source_identity_unique
         DO NOTHING
         RETURNING id`,
        values,
      );

      if (inserted.rows[0]) {
        await this.recordChange(
          client,
          tenantId,
          lease,
          {
            ...eventSource,
            activity_id: inserted.rows[0].id,
            change_type: 'created',
            changed_fields: [],
          },
          automationActionId,
        );

        return { id: inserted.rows[0].id, outcome: 'created' };
      }

      const existing = await client.query<
        StoredActivityContent & { id: string; content_hash: string }
      >(
        `SELECT id, content_hash, deleted_at,
                type, title, time_kind, time_role,
                on_date::text AS on_date, at, end_at, status, details
         FROM sync.activities
         WHERE tenant_id = $1
           AND source_connection_id = $2
           AND source_collection = $3
           AND external_id = $4
         FOR UPDATE`,
        values.slice(0, 4),
      );

      const stored = existing.rows[0];
      if (!stored) {
        throw new Error('No se pudo recuperar la actividad existente');
      }

      if (stored.content_hash === hash && stored.deleted_at === null) {
        await client.query(
          `UPDATE sync.activities
           SET source_updated_at = $3::timestamptz,
               last_synced_at = clock_timestamp()
           WHERE id = $1 AND tenant_id = $2`,
          [stored.id, tenantId, activity.source_updated_at],
        );
        return { id: stored.id, outcome: 'unchanged' };
      }

      await client.query(
        `UPDATE sync.activities
         SET type = $5,
             title = $6,
             time_kind = $7,
             time_role = $8,
             on_date = $9::date,
             at = $10::timestamptz,
             end_at = $11::timestamptz,
             status = $12,
             details = $13::jsonb,
             source_updated_at = $14::timestamptz,
             content_hash = $15,
             deleted_at = NULL,
             updated_at = clock_timestamp(),
             last_synced_at = clock_timestamp()
         WHERE tenant_id = $1
           AND source_connection_id = $2
           AND source_collection = $3
           AND external_id = $4`,
        values,
      );
      await this.recordChange(
        client,
        tenantId,
        lease,
        {
          ...eventSource,
          activity_id: stored.id,
          change_type: 'updated',
          changed_fields: lease ? changedActivityFields(stored, activity) : [],
        },
        automationActionId,
      );
      return { id: stored.id, outcome: 'updated' };
    });
  }

  private async recordChange(
    client: PoolClient,
    tenantId: string,
    lease: ActivityRunLease | undefined,
    payload: Omit<DataChangedPayload, 'sync_run_id'>,
    automationActionId: string | null,
  ): Promise<void> {
    if (!lease) return;

    if (
      payload.change_type === 'updated' &&
      payload.changed_fields.length === 0
    ) {
      return;
    }

    await appendOutboxEvent(
      client,
      createDataChangedEvent(
        tenantId,
        {
          ...payload,
          sync_run_id: lease.run_id,
        },
        automationActionId ?? undefined,
      ),
    );
  }

  async retire(
    tenantId: string,
    retirement: ActivityRetirement,
    lease?: ActivityRunLease,
  ): Promise<ActivityRetirementResult> {
    return this.database.transaction<ActivityRetirementResult>(
      async (client) => {
        const automationActionId = lease
          ? await this.assertRunLease(
              client,
              tenantId,
              retirement.source_connection_id,
              retirement.source_collection,
              lease,
            )
          : null;
        const existing = await client.query<{
          id: string;
          type: ActivityType;
          deleted_at: Date | null;
        }>(
          `SELECT id, type, deleted_at
         FROM sync.activities
         WHERE tenant_id = $1
           AND source_connection_id = $2
           AND source_collection = $3
           AND external_id = $4
         FOR UPDATE`,
          [
            tenantId,
            retirement.source_connection_id,
            retirement.source_collection,
            retirement.external_id,
          ],
        );

        const stored = existing.rows[0];
        if (!stored) {
          return { id: null, outcome: 'not_found' };
        }

        if (stored.deleted_at !== null) {
          await client.query(
            `UPDATE sync.activities
           SET source_updated_at = $3::timestamptz,
               last_synced_at = clock_timestamp()
           WHERE id = $1 AND tenant_id = $2`,
            [stored.id, tenantId, retirement.source_updated_at],
          );
          return { id: stored.id, outcome: 'unchanged' };
        }

        await client.query(
          `UPDATE sync.activities
         SET deleted_at = $3::timestamptz,
             source_updated_at = $4::timestamptz,
             updated_at = clock_timestamp(),
             last_synced_at = clock_timestamp()
         WHERE id = $1 AND tenant_id = $2`,
          [
            stored.id,
            tenantId,
            retirement.source_deleted_at,
            retirement.source_updated_at,
          ],
        );
        await this.recordChange(
          client,
          tenantId,
          lease,
          {
            activity_id: stored.id,
            source_connection_id: retirement.source_connection_id,
            source_collection: retirement.source_collection,
            activity_type: stored.type,
            external_id: retirement.external_id,
            change_type: 'retired',
            changed_fields: ['deleted_at'],
          },
          automationActionId,
        );
        return { id: stored.id, outcome: 'retired' };
      },
    );
  }
}
