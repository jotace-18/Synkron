import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service';
import { CredentialsService } from '../src/credentials/credentials.service';
import { SyncSourcesService } from '../src/connections/sync-sources.service';
import { ConnectionTargetPolicyService } from '../src/connections/connection-target-policy.service';
import { ConnectorImportTransport } from '../src/imports/connector-import.transport';
import { ActivityImportPipeline } from '../src/imports/activity-import.pipeline';
import { ActivitiesService } from '../src/activities/activities.service';
import { CanonicalImportService } from '../src/imports/canonical-import.service';
import type { CanonicalReaderService } from '../src/connectors/canonical/canonical-reader.service';
import { RunsService } from '../src/runs/runs.service';
import { RunProcessorService } from '../src/runs/run-processor.service';
import { ConnectorRegistryService } from '../src/connectors/connector-registry.service';
import type { AcademicImportService } from '../src/imports/academic-import.service';
import type { AcademicExamsImportService } from '../src/imports/academic-exams-import.service';
import type { StoredIngestionImporter } from '../src/ingestions/stored-ingestion.importer';

import type { ActivitySchedule } from '../src/activities/activity.types';
import { NotFoundException } from '@nestjs/common';

describe('Canonical Personal integration (PostgreSQL)', () => {
  const owner = randomUUID(),
    otherOwner = randomUUID();
  let db: DatabaseService;
  const previousOrigins = process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
  beforeAll(() => {
    process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = 'http://personal:3000';
    db = new DatabaseService();
  });
  afterAll(async () => {
    if (previousOrigins === undefined)
      delete process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    else process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = previousOrigins;
    for (const table of [
      'event_outbox',
      'runs',
      'activities',
      'definitions',
      'connections',
    ])
      await db.query(`DELETE FROM sync.${table} WHERE tenant_id IN ($1,$2)`, [
        owner,
        otherOwner,
      ]);
    await db.onModuleDestroy();
  });
  it('uses the canonical worker for all time forms, preserves identity, validates the whole export and keeps owners separate', async () => {
    const credentials = new CredentialsService();
    const sources = new SyncSourcesService(
      db,
      credentials,
      new ConnectionTargetPolicyService(),
    );
    const input = {
      name: 'Otros',
      base_url: 'http://personal:3000/api/v1/activities/export',
      connector: 'standard.activities' as const,
      auth: { type: 'bearer' as const, token: 'fictional-personal-token' },
      enabled: true,
    };
    const own = await sources.create(owner, input);
    expect((await sources.create(owner, input)).definition.id).toBe(
      own.definition.id,
    );
    const other = await sources.create(otherOwner, {
      ...input,
      auth: { type: 'bearer', token: 'another-fictional-token' },
    });
    expect(other.connection.id).not.toBe(own.connection.id);
    let activity: {
      type: 'personal.event';
      title: string;
      schedule: ActivitySchedule;
      status: string;
      details: { people: string[] };
    } = {
      type: 'personal.event',
      title: 'Comprar',
      schedule: {
        kind: 'date',
        role: 'start',
        date: '2026-11-25',
        at: null,
        end_at: null,
      },
      status: 'pending',
      details: { people: [] },
    };
    const upsert = () => ({
      schema_version: 1,
      action: 'upsert',
      external_id: 'events:CaseSensitive-ID',
      source_updated_at: null,
      activity,
    });
    let source: unknown[] = [upsert()];
    const reader = {
      readAll: jest.fn().mockImplementation(() => Promise.resolve(source)),
    };
    const activities = new ActivitiesService(db);
    const importer = new CanonicalImportService(
      new ConnectorImportTransport(
        db,
        credentials,
        new ActivityImportPipeline(activities),
      ),
      reader as unknown as CanonicalReaderService,
    );
    const runs = new RunsService(db);
    const processor = new RunProcessorService(
      runs,
      new ConnectorRegistryService(
        {} as AcademicImportService,
        {} as AcademicExamsImportService,
        {} as StoredIngestionImporter,
        importer,
      ),
    );
    const execute = async (expected = 'completed') => {
      const queued = await runs.createQueued(owner, own.definition.id);
      const claim = await runs.claimQueued(owner, queued.id);
      expect(claim?.connector).toBe('standard.activities');
      await processor.process(claim!);
      const result = await runs.get(owner, queued.id);
      expect(result.status).toBe(expected);
      return result;
    };
    expect((await execute()).created_count).toBe(1);
    expect(reader.readAll).toHaveBeenCalledWith(
      input.base_url,
      'fictional-personal-token',
      expect.any(AbortSignal),
    );
    const original = await db.query<{ id: string }>(
      'SELECT id FROM sync.activities WHERE tenant_id=$1',
      [owner],
    );
    const id = original.rows[0].id;
    expect((await activities.get(owner, id)).schedule).toEqual(
      activity.schedule,
    );
    expect((await execute()).unchanged_count).toBe(1);
    activity = {
      ...activity,
      title: 'Peluquería',
      schedule: {
        kind: 'instant',
        role: 'start',
        date: null,
        at: '2026-11-25T10:00:00+01:00',
        end_at: null,
      },
      details: { people: ['Ana'] },
    };
    source = [upsert()];
    expect((await execute()).updated_count).toBe(1);
    expect(await activities.get(owner, id)).toMatchObject({
      id,
      type: 'personal.event',
      title: 'Peluquería',
      schedule: {
        kind: 'instant',
        date: null,
        at: '2026-11-25T09:00:00.000Z',
        end_at: null,
      },
      details: { people: ['Ana'] },
    });
    activity = {
      ...activity,
      status: 'completed',
      schedule: {
        kind: 'interval',
        role: 'start',
        date: null,
        at: '2026-11-25T10:00:00+01:00',
        end_at: '2026-11-25T10:30:00+01:00',
      },
    };
    source = [upsert()];
    expect((await execute()).updated_count).toBe(1);
    expect((await activities.get(owner, id)).schedule).toMatchObject({
      kind: 'interval',
      end_at: '2026-11-25T09:30:00.000Z',
    });
    const valid = upsert();
    source = [
      {
        ...valid,
        activity: { ...activity, title: 'This change must not be saved' },
      },
      {
        ...valid,
        external_id: 'events:invalid',
        activity: { ...activity, details: { people: [1] } },
      },
    ];
    const failed = await execute('failed');
    expect(failed.updated_count).toBe(0);
    expect(failed.created_count).toBe(0);
    expect((await activities.get(owner, id)).title).toBe('Peluquería');
    activity = {
      ...activity,
      status: 'cancelled',
      schedule: {
        kind: 'date',
        role: 'start',
        date: '2026-11-26',
        at: null,
        end_at: null,
      },
    };
    source = [upsert()];
    expect((await execute()).updated_count).toBe(1);
    expect(await activities.get(owner, id)).toMatchObject({
      id,
      status: 'cancelled',
      schedule: { kind: 'date', date: '2026-11-26', at: null, end_at: null },
    });
    source = [];
    await execute();
    expect((await activities.get(owner, id)).id).toBe(id);
    source = [
      {
        schema_version: 1,
        action: 'retire',
        external_id: 'events:CaseSensitive-ID',
        source_updated_at: null,
        source_deleted_at: '2026-11-26T12:00:00Z',
      },
    ];
    const retired = await execute();
    expect(retired.retired_count).toBe(1);
    expect((await execute()).unchanged_count).toBe(1);
    await expect(activities.get(owner, id)).rejects.toThrow(NotFoundException);
    await expect(runs.get(otherOwner, retired.id)).rejects.toThrow(
      NotFoundException,
    );
    expect(
      (
        await db.query('SELECT id FROM sync.activities WHERE tenant_id=$1', [
          otherOwner,
        ])
      ).rowCount,
    ).toBe(0);
    const events = await db.query<{
      payload: { activity_type: string; changed_fields: string[] };
    }>(
      `SELECT payload FROM sync.event_outbox WHERE tenant_id=$1 AND event_type='data.changed'`,
      [owner],
    );
    expect(
      events.rows.every(
        ({ payload }) => payload.activity_type === 'personal.event',
      ),
    ).toBe(true);
    expect(
      events.rows.some(({ payload }) =>
        payload.changed_fields.includes('people'),
      ),
    ).toBe(true);
    expect(
      events.rows.some(({ payload }) =>
        payload.changed_fields.includes('schedule'),
      ),
    ).toBe(true);
    // The migration also keeps the former, never-enabled type readable without rewriting history.
    await db.query(
      `INSERT INTO sync.activities(tenant_id,source_connection_id,source_collection,external_id,type,title,time_kind,time_role,on_date,details,content_hash) VALUES($1,$2,'activities','legacy-id','social.plan','Legacy plan','date','start','2026-11-25','{}',$3)`,
      [owner, own.connection.id, 'a'.repeat(64)],
    );
    const legacy = await db.query<{ type: string }>(
      'SELECT type FROM sync.activities WHERE tenant_id=$1 AND external_id=$2',
      [owner, 'legacy-id'],
    );
    expect(legacy.rows[0].type).toBe('social.plan');
  });
});
