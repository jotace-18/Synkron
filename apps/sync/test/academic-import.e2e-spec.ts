import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from '../src/activities/activities.service';
import { AcademicReaderService } from '../src/connectors/academic/academic-reader.service';
import type { AcademicAssignmentSource } from '../src/connectors/academic/assignment-source.types';
import { ConnectionTargetPolicyService } from '../src/connections/connection-target-policy.service';
import { CredentialsService } from '../src/credentials/credentials.service';
import { DatabaseService } from '../src/database/database.service';
import { AcademicImportService } from '../src/imports/academic-import.service';
import type { AcademicImportResult } from '../src/imports/academic-import.types';

interface StoredActivity {
  id: string;
  title: string;
  details: { grade: number | null };
  deleted_at: Date | null;
  content_hash: string;
  created_at: Date;
  updated_at: Date;
  last_synced_at: Date;
}

describe('Academic import (PostgreSQL integration, simulated source HTTP)', () => {
  const address = 'http://academic:3000/api/v1/assignments/export';
  const token = 'academic-import-test-token';
  let previousOrigins: string | undefined;
  let module: TestingModule;
  let database: DatabaseService;
  let credentials: CredentialsService;
  let service: AcademicImportService;
  let owner: string;
  let otherOwner: string;
  let connectionId: string;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    previousOrigins = process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = 'http://academic:3000';
    module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        CredentialsService,
        ConnectionTargetPolicyService,
        AcademicReaderService,
        ActivitiesService,
        AcademicImportService,
      ],
    }).compile();
    await module.init();
    database = module.get(DatabaseService);
    credentials = module.get(CredentialsService);
    service = module.get(AcademicImportService);
  });

  beforeEach(async () => {
    owner = randomUUID();
    otherOwner = randomUUID();
    connectionId = randomUUID();
    fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock.mockRejectedValue(new Error('Unexpected source request'));
    await database.query(
      `INSERT INTO sync.connections (id, tenant_id, name, base_url, auth_type, credentials_encrypted)
       VALUES ($1, $2, 'Academic import test', $3, 'bearer', $4)`,
      [
        connectionId,
        owner,
        address,
        credentials.encrypt(token, owner, connectionId),
      ],
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await database.query(
      'DELETE FROM sync.activities WHERE tenant_id IN ($1, $2)',
      [owner, otherOwner],
    );
    await database.query(
      'DELETE FROM sync.connections WHERE tenant_id IN ($1, $2)',
      [owner, otherOwner],
    );
  });

  afterAll(async () => {
    await module?.close();
    if (previousOrigins === undefined)
      delete process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    else process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = previousOrigins;
  });

  function assignment(
    overrides: Partial<AcademicAssignmentSource> = {},
  ): AcademicAssignmentSource {
    return {
      id: randomUUID(),
      title: 'Entrega de integración',
      course_name: 'Cloud Computing',
      course_abbreviation: 'CC',
      section: 'practice',
      mandatory: true,
      due_date: '2026-11-24',
      due_at: null,
      status: 'pending',
      work_mode: 'individual',
      group_members: [],
      weight_percent: null,
      weight_basis: null,
      grade: null,
      created_at: '2026-11-08T19:00:00Z',
      updated_at: '2026-11-08T19:00:00Z',
      deleted_at: null,
      ...overrides,
    };
  }

  function respond(records: AcademicAssignmentSource[]): void {
    fetchMock.mockImplementation((input) => {
      if (!(input instanceof URL)) throw new Error('Expected URL');
      const offset = Number(input.searchParams.get('offset'));
      const limit = Number(input.searchParams.get('limit'));
      return Promise.resolve(
        Response.json(records.slice(offset, offset + limit)),
      );
    });
  }

  function summary(
    counts: Partial<AcademicImportResult>,
  ): AcademicImportResult {
    return {
      connection_id: connectionId,
      read: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      retired: 0,
      ignored: 0,
      ...counts,
    };
  }

  async function stored(externalId: string): Promise<StoredActivity> {
    const result = await database.query<StoredActivity>(
      `SELECT id, title, details, deleted_at, content_hash, created_at, updated_at, last_synced_at
       FROM sync.activities WHERE tenant_id = $1 AND source_connection_id = $2
       AND source_collection = 'assignments' AND external_id = $3`,
      [owner, connectionId, externalId],
    );
    return result.rows[0];
  }

  async function count(): Promise<number> {
    const result = await database.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM sync.activities WHERE tenant_id = $1',
      [owner],
    );
    return result.rows[0].count;
  }

  it('decrypts the saved credential, reads the source and imports once without exposing secrets', async () => {
    const source = assignment();
    respond([source]);
    expect(await service.run(owner, connectionId)).toEqual(
      summary({ read: 1, created: 1 }),
    );
    const before = await stored(source.id);
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    });
    expect(await service.run(owner, connectionId)).toEqual(
      summary({ read: 1, unchanged: 1 }),
    );
    const after = await stored(source.id);
    expect(after.id).toBe(before.id);
    expect(after.updated_at).toEqual(before.updated_at);
    expect(await count()).toBe(1);
  });

  it('updates the original activity after a source grade and status change', async () => {
    const source = assignment();
    respond([source]);
    await service.run(owner, connectionId);
    const before = await stored(source.id);
    respond([
      {
        ...source,
        grade: 8.75,
        status: 'submitted',
        updated_at: '2026-11-09T12:00:00Z',
      },
    ]);
    expect(await service.run(owner, connectionId)).toEqual(
      summary({ read: 1, updated: 1 }),
    );
    expect(await stored(source.id)).toMatchObject({
      id: before.id,
      details: { grade: 8.75 },
      created_at: before.created_at,
    });
    expect(await count()).toBe(1);
  });

  it('retires an explicitly deleted source record and treats the repeated deletion as unchanged', async () => {
    const source = assignment();
    respond([source]);
    await service.run(owner, connectionId);
    const before = await stored(source.id);
    respond([
      {
        ...source,
        deleted_at: '2026-11-09T12:00:00Z',
        updated_at: '2026-11-09T12:00:00Z',
      },
    ]);
    expect(await service.run(owner, connectionId)).toEqual(
      summary({ read: 1, retired: 1 }),
    );
    const retired = await stored(source.id);
    expect(retired).toMatchObject({
      id: before.id,
      deleted_at: new Date('2026-11-09T12:00:00Z'),
    });
    expect(await service.run(owner, connectionId)).toEqual(
      summary({ read: 1, unchanged: 1 }),
    );
    expect((await stored(source.id)).updated_at).toEqual(retired.updated_at);
  });

  it('ignores an explicit deletion that predates its first import instead of creating a placeholder', async () => {
    respond([
      assignment({
        deleted_at: '2026-11-09T12:00:00Z',
        updated_at: '2026-11-09T12:00:00Z',
      }),
    ]);
    expect(await service.run(owner, connectionId)).toEqual(
      summary({ read: 1, ignored: 1 }),
    );
    expect(await count()).toBe(0);
  });

  it('reactivates the original identity if the source later returns an active record', async () => {
    const source = assignment();
    respond([source]);
    await service.run(owner, connectionId);
    const before = await stored(source.id);
    respond([{ ...source, deleted_at: '2026-11-09T12:00:00Z' }]);
    await service.run(owner, connectionId);
    respond([source]);
    expect(await service.run(owner, connectionId)).toEqual(
      summary({ read: 1, updated: 1 }),
    );
    expect(await stored(source.id)).toMatchObject({
      id: before.id,
      deleted_at: null,
    });
    expect(await count()).toBe(1);
  });

  it('imports multiple validated pages and counts every record', async () => {
    respond(Array.from({ length: 21 }, () => assignment()));
    expect(await service.run(owner, connectionId)).toEqual(
      summary({ read: 21, created: 21 }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toEqual(
      new URL(`${address}?limit=20&offset=20`),
    );
    expect(await count()).toBe(21);
  });

  it('does not persist any page or alter existing data when a later source record is invalid', async () => {
    const source = assignment();
    respond([source]);
    await service.run(owner, connectionId);
    const before = await stored(source.id);
    respond([
      { ...source, grade: 9 },
      ...Array.from({ length: 19 }, () => assignment()),
      assignment({ grade: 11 }),
    ]);
    await expect(service.run(owner, connectionId)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(await stored(source.id)).toEqual(before);
    expect(await count()).toBe(1);
  });

  it('does not infer retirement from an empty source response', async () => {
    const source = assignment();
    respond([source]);
    await service.run(owner, connectionId);
    const before = await stored(source.id);
    respond([]);
    expect(await service.run(owner, connectionId)).toEqual(summary({}));
    expect(await stored(source.id)).toEqual(before);
  });

  it('rejects another owner before sending a source request or writing activities', async () => {
    await expect(service.run(otherOwner, connectionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await count()).toBe(0);
  });

  it('rejects a disabled source connection before sending credentials', async () => {
    await database.query(
      'UPDATE sync.connections SET enabled = false WHERE id = $1 AND tenant_id = $2',
      [connectionId, owner],
    );
    await expect(service.run(owner, connectionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects encrypted credentials copied from another owner context', async () => {
    await database.query(
      'UPDATE sync.connections SET credentials_encrypted = $3 WHERE id = $1 AND tenant_id = $2',
      [
        connectionId,
        owner,
        credentials.encrypt(token, otherOwner, connectionId),
      ],
    );
    await expect(service.run(owner, connectionId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces the allowed origin policy before sending the decrypted credential', async () => {
    await database.query(
      'UPDATE sync.connections SET base_url = $3 WHERE id = $1 AND tenant_id = $2',
      [connectionId, owner, 'http://api:3003/internal/auth/session'],
    );
    await expect(service.run(owner, connectionId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps existing activities intact when a later source page fails', async () => {
    const source = assignment();
    respond([source]);
    await service.run(owner, connectionId);
    const before = await stored(source.id);
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(
        Response.json([
          source,
          ...Array.from({ length: 19 }, () => assignment()),
        ]),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(service.run(owner, connectionId)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(await stored(source.id)).toEqual(before);
    expect(await count()).toBe(1);
  });
});
