import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service';
import type {
  ActivityInput,
  ActivityRetirement,
  ActivityRetirementResult,
  ActivitySaveResult,
} from '../activities/activity.types';
import { AcademicReaderService } from '../connectors/academic/academic-reader.service';
import type { AcademicAssignmentSource } from '../connectors/academic/assignment-source.types';
import { CredentialsService } from '../credentials/credentials.service';
import { DatabaseService } from '../database/database.service';
import { AcademicImportService } from './academic-import.service';

describe('AcademicImportService', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const connectionId = '22222222-2222-4222-8222-222222222222';
  const connection = {
    id: connectionId,
    base_url: 'http://academic:3000/api/v1/assignments/export',
    enabled: true,
    auth_type: 'bearer',
    credentials_encrypted: 'encrypted-token',
  };
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>();
  const decrypt = jest.fn<string, [string, string, string]>();
  const readAll = jest.fn<
    Promise<AcademicAssignmentSource[]>,
    [string, string]
  >();
  const save = jest.fn<Promise<ActivitySaveResult>, [string, ActivityInput]>();
  const retire = jest.fn<
    Promise<ActivityRetirementResult>,
    [string, ActivityRetirement]
  >();
  let service: AcademicImportService;

  function assignment(index = 0, deleted = false): AcademicAssignmentSource {
    return {
      id: `d1903b29-d126-4c48-9bbf-${index.toString(16).padStart(12, '0')}`,
      title: 'Entrega de pruebas',
      course_name: 'CC',
      course_abbreviation: null,
      section: 'practice',
      mandatory: true,
      due_date: '2026-11-24',
      due_at: null,
      status: 'submitted',
      work_mode: 'individual',
      group_members: [],
      weight_percent: null,
      weight_basis: null,
      grade: 8.75,
      created_at: '2026-11-08T19:00:00Z',
      updated_at: '2026-11-09T12:00:00Z',
      deleted_at: deleted ? '2026-11-09T12:00:00Z' : null,
    };
  }

  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [connection] });
    decrypt.mockReset().mockReturnValue('plain-test-token');
    readAll.mockReset().mockResolvedValue([]);
    save
      .mockReset()
      .mockResolvedValue({ id: 'central-id', outcome: 'created' });
    retire
      .mockReset()
      .mockResolvedValue({ id: 'central-id', outcome: 'retired' });
    service = new AcademicImportService(
      { query } as unknown as DatabaseService,
      { decrypt } as unknown as CredentialsService,
      { readAll } as unknown as AcademicReaderService,
      { save, retire } as unknown as ActivitiesService,
    );
  });

  it('loads only the owner connection, decrypts with that context and returns a count-only summary', async () => {
    const source = assignment();
    readAll.mockResolvedValue([source]);
    await expect(service.run(owner, connectionId)).resolves.toEqual({
      connection_id: connectionId,
      read: 1,
      created: 1,
      updated: 0,
      unchanged: 0,
      retired: 0,
      ignored: 0,
    });
    expect(query.mock.calls[0][1]).toEqual([owner, connectionId]);
    expect(decrypt).toHaveBeenCalledWith(
      'encrypted-token',
      owner,
      connectionId,
    );
    expect(readAll).toHaveBeenCalledWith(
      connection.base_url,
      'plain-test-token',
    );
    expect(save.mock.calls[0][0]).toBe(owner);
    expect(save.mock.calls[0][1]).toMatchObject({
      source_connection_id: connectionId,
      external_id: source.id,
      type: 'academic.assignment',
      details: { grade: 8.75 },
    });
    expect(retire).not.toHaveBeenCalled();
  });

  it('returns zero counts for an empty source without removing existing activities', async () => {
    await expect(service.run(owner, connectionId)).resolves.toEqual({
      connection_id: connectionId,
      read: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      retired: 0,
      ignored: 0,
    });
    expect(save).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it('aggregates creation, update, unchanged, retirement and ignored source records', async () => {
    readAll.mockResolvedValue([
      assignment(0),
      assignment(1),
      assignment(2),
      assignment(3, true),
      assignment(4, true),
      assignment(5, true),
    ]);
    save
      .mockResolvedValueOnce({ id: 'a', outcome: 'created' })
      .mockResolvedValueOnce({ id: 'b', outcome: 'updated' })
      .mockResolvedValueOnce({ id: 'c', outcome: 'unchanged' });
    retire
      .mockResolvedValueOnce({ id: 'd', outcome: 'retired' })
      .mockResolvedValueOnce({ id: 'e', outcome: 'unchanged' })
      .mockResolvedValueOnce({ id: null, outcome: 'not_found' });
    await expect(service.run(owner, connectionId)).resolves.toEqual({
      connection_id: connectionId,
      read: 6,
      created: 1,
      updated: 1,
      unchanged: 2,
      retired: 1,
      ignored: 1,
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect(retire).toHaveBeenCalledTimes(3);
    expect(retire.mock.calls[0]).toEqual([
      owner,
      {
        action: 'retire',
        source_connection_id: connectionId,
        source_collection: 'assignments',
        external_id: assignment(3).id,
        source_updated_at: '2026-11-09T12:00:00.000Z',
        source_deleted_at: '2026-11-09T12:00:00.000Z',
      },
    ]);
  });

  it('rejects a missing or foreign connection before decrypting, reading or writing', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(service.run(owner, connectionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(decrypt).not.toHaveBeenCalled();
    expect(readAll).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it('rejects a disabled connection before reading its source', async () => {
    query.mockResolvedValue({ rows: [{ ...connection, enabled: false }] });
    await expect(service.run(owner, connectionId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(decrypt).not.toHaveBeenCalled();
    expect(readAll).not.toHaveBeenCalled();
  });

  it('rejects an Academic connection without Bearer authentication', async () => {
    query.mockResolvedValue({
      rows: [{ ...connection, auth_type: 'none', credentials_encrypted: null }],
    });
    await expect(service.run(owner, connectionId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(readAll).not.toHaveBeenCalled();
  });

  it('rejects a missing encrypted credential', async () => {
    query.mockResolvedValue({
      rows: [{ ...connection, credentials_encrypted: null }],
    });
    await expect(service.run(owner, connectionId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(decrypt).not.toHaveBeenCalled();
    expect(readAll).not.toHaveBeenCalled();
  });

  it('does not expose cryptographic details if credential decryption fails', async () => {
    decrypt.mockImplementation(() => {
      throw new Error('private cryptographic details');
    });
    await expect(service.run(owner, connectionId)).rejects.toThrow(
      'No se pudo recuperar la credencial',
    );
    expect(readAll).not.toHaveBeenCalled();
  });

  it('propagates a database lookup failure before calling the source', async () => {
    const error = new Error('Database unavailable');
    query.mockRejectedValue(error);
    await expect(service.run(owner, connectionId)).rejects.toBe(error);
    expect(readAll).not.toHaveBeenCalled();
  });

  it('does not persist a partial read when source reading fails', async () => {
    const error = new BadGatewayException('Read failed');
    readAll.mockRejectedValue(error);
    await expect(service.run(owner, connectionId)).rejects.toBe(error);
    expect(save).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it('maps and validates all source records before the first database write', async () => {
    readAll.mockResolvedValue([assignment(0), { ...assignment(1), grade: 11 }]);
    await expect(service.run(owner, connectionId)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(save).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it('stops after a persistence failure instead of returning a successful import summary', async () => {
    const error = new Error('Save failed');
    readAll.mockResolvedValue([assignment(0), assignment(1)]);
    save.mockRejectedValueOnce(error);
    await expect(service.run(owner, connectionId)).rejects.toBe(error);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('propagates a retirement failure and does not process later records', async () => {
    const error = new Error('Retirement failed');
    readAll.mockResolvedValue([assignment(0, true), assignment(1)]);
    retire.mockRejectedValueOnce(error);
    await expect(service.run(owner, connectionId)).rejects.toBe(error);
    expect(save).not.toHaveBeenCalled();
  });
});
