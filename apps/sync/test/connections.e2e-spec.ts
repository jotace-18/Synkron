import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { ConnectionsService } from '../src/connections/connections.service';
import { DatabaseService } from '../src/database/database.service';

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
