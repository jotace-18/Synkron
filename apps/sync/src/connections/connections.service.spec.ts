import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { DatabaseService } from '../database/database.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ConnectionProbeService } from './connection-probe.service';

describe('ConnectionsService', () => {
  const query = jest.fn<
    Promise<{ rows: unknown[] }>,
    [sql: string, values?: unknown[]]
  >();
  const decrypt = jest.fn();
  const probe = jest.fn();
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const connectionId = '22222222-2222-4222-8222-222222222222';
  const storedConnection = {
    id: connectionId,
    base_url: 'http://task-api:3000/tasks',
    auth_type: 'none',
    credentials_encrypted: null,
  };
  let service: ConnectionsService;

  beforeEach(() => {
    query.mockReset();
    decrypt.mockReset();
    probe.mockReset();

    const database = { query } as unknown as DatabaseService;
    const credentials = {
      encrypt: jest.fn(),
      decrypt,
    } as unknown as CredentialsService;
    const client = { probe } as unknown as ConnectionProbeService;
    service = new ConnectionsService(database, credentials, client);
  });

  it('returns an empty list when the owner has no connections', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      service.list('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual([]);
  });

  it('propagates database errors instead of reporting an empty list', async () => {
    const error = new Error('Database unavailable');
    query.mockRejectedValue(error);

    await expect(
      service.list('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBe(error);
  });

  it('tests an unauthenticated connection without decrypting a credential', async () => {
    query.mockResolvedValue({ rows: [storedConnection] });
    const result = { ok: false, status_code: 401, error: 'http_error' };
    probe.mockResolvedValue(result);

    await expect(
      service.testConnection(tenantId, connectionId),
    ).resolves.toEqual(result);
    expect(query.mock.calls[0][1]).toEqual([tenantId, connectionId]);
    expect(decrypt).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledWith(storedConnection.base_url, undefined);
  });

  it('decrypts a Bearer credential for its owner and connection before probing', async () => {
    query.mockResolvedValue({
      rows: [
        {
          ...storedConnection,
          auth_type: 'bearer',
          credentials_encrypted: 'encrypted-value',
        },
      ],
    });
    decrypt.mockReturnValue('token-ficticio');
    const result = { ok: true, status_code: 200, error: null };
    probe.mockResolvedValue(result);

    await expect(
      service.testConnection(tenantId, connectionId),
    ).resolves.toEqual(result);
    expect(decrypt).toHaveBeenCalledWith(
      'encrypted-value',
      tenantId,
      connectionId,
    );
    expect(probe).toHaveBeenCalledWith(
      storedConnection.base_url,
      'token-ficticio',
    );
  });

  it('rejects a missing scoped connection before decrypting or probing', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      service.testConnection(tenantId, connectionId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(decrypt).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'missing', encrypted: null },
    { label: 'unreadable', encrypted: 'corrupted-value' },
  ])(
    'rejects a $label Bearer credential without making a request',
    async ({ encrypted }) => {
      query.mockResolvedValue({
        rows: [
          {
            ...storedConnection,
            auth_type: 'bearer',
            credentials_encrypted: encrypted,
          },
        ],
      });
      decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect(
        service.testConnection(tenantId, connectionId),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(probe).not.toHaveBeenCalled();
    },
  );

  it('preserves the rejection of an unauthorized target', async () => {
    query.mockResolvedValue({ rows: [storedConnection] });
    probe.mockRejectedValue(new ForbiddenException('Destino no autorizado'));

    await expect(
      service.testConnection(tenantId, connectionId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
