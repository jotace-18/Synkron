import { ConnectionsService } from './connections.service';
import { DatabaseService } from '../database/database.service';

describe('ConnectionsService', () => {
  const query = jest.fn();
  let service: ConnectionsService;

  beforeEach(() => {
    query.mockReset();

    const database = { query } as unknown as DatabaseService;
    service = new ConnectionsService(database);
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
});
