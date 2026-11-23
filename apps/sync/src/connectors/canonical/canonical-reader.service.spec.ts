import { CanonicalReaderService } from './canonical-reader.service';
import { ConnectionTargetPolicyService } from '../../connections/connection-target-policy.service';

describe('Canonical reader transport', () => {
  const address = 'http://sport:3000/api/v1/activities/export';
  let reader: CanonicalReaderService;
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = 'http://sport:3000';
    reader = new CanonicalReaderService(new ConnectionTargetPolicyService());
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (previous === undefined)
      delete process.env.SYNC_ALLOWED_CONNECTION_ORIGINS;
    else process.env.SYNC_ALLOWED_CONNECTION_ORIGINS = previous;
  });
  it('paginates opaque case-sensitive IDs without changing them and never follows redirects', async () => {
    const first = Array.from({ length: 20 }, (_, i) => ({
      external_id: String(i),
    }));
    const fetcher = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(
        Response.json([{ external_id: 'ID' }, { external_id: 'id' }]),
      );
    expect((await reader.readAll(address, 'fictional')).length).toBe(22);
    expect((fetcher.mock.calls[1][0] as URL).href).toBe(
      `${address}?limit=20&offset=20`,
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      redirect: 'manual',
      headers: { Authorization: 'Bearer fictional' },
    });
  });
  it('rejects duplicates, oversized pages, forbidden targets and redirects without leaking response contents', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch');
    fetcher.mockResolvedValueOnce(
      Response.json([{ external_id: 'same' }, { external_id: 'same' }]),
    );
    await expect(reader.readAll(address, 'fictional')).rejects.toThrow(
      'repetidos',
    );
    fetcher.mockResolvedValueOnce(new Response('private'.repeat(12000)));
    await expect(reader.readAll(address, 'fictional')).rejects.toThrow(
      '64 KiB',
    );
    fetcher.mockResolvedValueOnce(
      new Response('secret', {
        status: 302,
        headers: { Location: 'http://elsewhere/' },
      }),
    );
    await expect(reader.readAll(address, 'fictional')).rejects.toThrow(
      'página válida',
    );
    await expect(
      reader.readAll('http://elsewhere/export', 'fictional'),
    ).rejects.toThrow('Destino no autorizado');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
