import { UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const query = jest.fn<
    Promise<{ rows: { id: string }[] }>,
    [sql: string, values?: unknown[]]
  >();
  const token = 'a'.repeat(64);
  const accountId = '11111111-1111-4111-8111-111111111111';
  let service: AuthService;

  beforeEach(() => {
    query.mockReset();
    service = new AuthService({ query } as unknown as DatabaseService);
  });

  it('looks up the SHA-256 hash instead of sending the credential to PostgreSQL', async () => {
    query.mockResolvedValue({ rows: [{ id: accountId }] });

    await expect(service.authenticate(token)).resolves.toBe(accountId);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0];
    expect(sql).not.toContain(token);
    expect(values).toEqual([
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    ]);
  });

  it('rejects a well-formed credential when no enabled account matches it', async () => {
    query.mockResolvedValue({ rows: [] });
    const pending = service.authenticate(token);

    await expect(pending).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(pending).rejects.toThrow('Credencial académica no válida');
  });

  it.each([
    { label: 'empty token', value: '' },
    { label: 'short token', value: 'a'.repeat(63) },
    { label: 'long token', value: 'a'.repeat(65) },
    { label: 'non-hexadecimal token', value: 'g'.repeat(64) },
    { label: 'uppercase token', value: 'A'.repeat(64) },
    { label: 'leading whitespace', value: ` ${token}` },
    { label: 'trailing whitespace', value: `${token} ` },
    { label: 'trailing newline', value: `${token}\n` },
    { label: 'scheme included in the token', value: `Bearer ${token}` },
    { label: 'missing token', value: undefined },
    { label: 'null token', value: null },
    { label: 'numeric token', value: 123 },
    { label: 'object token', value: { token } },
  ])('rejects $label before querying PostgreSQL', async ({ value }) => {
    await expect(service.authenticate(value as string)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('propagates a database failure instead of reporting invalid credentials', async () => {
    const error = new Error('Database unavailable');
    query.mockRejectedValue(error);

    await expect(service.authenticate(token)).rejects.toBe(error);
  });
});
