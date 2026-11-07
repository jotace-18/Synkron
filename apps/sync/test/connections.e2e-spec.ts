import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { ConnectionsService } from '../src/connections/connections.service';
import { DatabaseService } from '../src/database/database.service';
import { CredentialsService } from '../src/credentials/credentials.service';

describe('ConnectionsService (integration)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let connections: ConnectionsService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await module.init();

    database = module.get(DatabaseService);
    connections = module.get(ConnectionsService);
  });

  afterAll(async () => {
    await module?.close();
  });

  it.each([
    { label: 'enabled by default', enabled: undefined, expectedEnabled: true },
    { label: 'explicitly disabled', enabled: false, expectedEnabled: false },
  ])(
    'creates a connection $label for its owner',
    async ({ enabled, expectedEnabled }) => {
      const owner = randomUUID();
      const otherOwner = randomUUID();

      try {
        const created = await connections.createWithoutAuth(owner, {
          name: "  My team's tasks  ",
          base_url: 'https://tasks.example.com',
          ...(enabled === undefined ? {} : { enabled }),
        });

        expect(created).toMatchObject({
          name: "My team's tasks",
          base_url: 'https://tasks.example.com',
          auth_type: 'none',
          has_credentials: false,
          enabled: expectedEnabled,
        });
        expect(typeof created.id).toBe('string');
        expect(created.created_at).toBeInstanceOf(Date);
        expect(created.updated_at).toBeInstanceOf(Date);
        expect(created).not.toHaveProperty('credentials_encrypted');

        const stored = await database.query<{
          tenant_id: string;
          credentials_encrypted: string | null;
        }>(
          `SELECT tenant_id, credentials_encrypted
         FROM sync.connections WHERE id = $1`,
          [created.id],
        );

        expect(stored.rows).toEqual([
          { tenant_id: owner, credentials_encrypted: null },
        ]);

        await expect(connections.list(owner)).resolves.toEqual([created]);
        await expect(connections.list(otherOwner)).resolves.toEqual([]);
      } finally {
        await database.query(
          'DELETE FROM sync.connections WHERE tenant_id = $1',
          [owner],
        );
      }
    },
  );

  it.each([
    { label: 'enabled by default', enabled: undefined, expectedEnabled: true },
    { label: 'explicitly disabled', enabled: false, expectedEnabled: false },
  ])(
    'stores a Bearer connection $label with encrypted credentials',
    async ({ enabled, expectedEnabled }) => {
      const owner = randomUUID();
      const otherOwner = randomUUID();
      const token = 'token-bearer-ficticio-para-pruebas';

      try {
        const created = await connections.createWithBearer(owner, {
          name: '  Bearer connection  ',
          base_url: 'https://tasks.example.com',
          token,
          ...(enabled === undefined ? {} : { enabled }),
        });

        expect(created).toMatchObject({
          name: 'Bearer connection',
          auth_type: 'bearer',
          has_credentials: true,
          enabled: expectedEnabled,
        });
        expect(created).not.toHaveProperty('token');
        expect(created).not.toHaveProperty('credentials_encrypted');
        expect(JSON.stringify(created)).not.toContain(token);

        const stored = await database.query<{
          tenant_id: string;
          auth_type: string;
          credentials_encrypted: string;
        }>(
          `SELECT tenant_id, auth_type, credentials_encrypted
         FROM sync.connections WHERE id = $1`,
          [created.id],
        );

        expect(stored.rows).toHaveLength(1);
        expect(stored.rows[0].tenant_id).toBe(owner);
        expect(stored.rows[0].auth_type).toBe('bearer');
        expect(stored.rows[0].credentials_encrypted).not.toContain(token);
        expect(
          module
            .get(CredentialsService)
            .decrypt(stored.rows[0].credentials_encrypted, owner, created.id),
        ).toBe(token);

        await expect(connections.list(owner)).resolves.toEqual([created]);
        await expect(connections.list(otherOwner)).resolves.toEqual([]);
      } finally {
        await database.query(
          'DELETE FROM sync.connections WHERE tenant_id = $1',
          [owner],
        );
      }
    },
  );

  it('does not test another owner connection or disclose whether it exists', async () => {
    const owner = randomUUID();
    const otherOwner = randomUUID();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected external request'));

    try {
      const created = await connections.createWithoutAuth(owner, {
        name: 'Private connection',
        base_url: 'http://task-api:3000/tasks',
      });

      for (const id of [created.id, randomUUID()]) {
        const pending = connections.testConnection(otherOwner, id);
        await expect(pending).rejects.toBeInstanceOf(NotFoundException);
        await expect(pending).rejects.toThrow('Conexión no encontrada');
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
      await database.query(
        'DELETE FROM sync.connections WHERE tenant_id = $1',
        [owner],
      );
    }
  });

  it('lists only the connections belonging to each owner', async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();

    try {
      await database.query(
        `INSERT INTO sync.connections
           (tenant_id, name, base_url, auth_type)
         VALUES
           ($1, 'Connection A', 'https://a.example.com', 'none'),
           ($2, 'Connection B', 'https://b.example.com', 'none')`,
        [ownerA, ownerB],
      );

      const resultA = await connections.list(ownerA);
      const resultB = await connections.list(ownerB);

      expect(resultA).toHaveLength(1);
      expect(resultB).toHaveLength(1);

      expect(resultA[0]).toMatchObject({
        name: 'Connection A',
        has_credentials: false,
      });

      expect(resultB[0]).toMatchObject({
        name: 'Connection B',
        has_credentials: false,
      });

      expect(resultA[0]).not.toHaveProperty('credentials_encrypted');
      expect(resultB[0]).not.toHaveProperty('credentials_encrypted');

      await expect(connections.list(randomUUID())).resolves.toEqual([]);
    } finally {
      await database.query(
        `DELETE FROM sync.connections
         WHERE tenant_id IN ($1, $2)`,
        [ownerA, ownerB],
      );
    }
  });
});
