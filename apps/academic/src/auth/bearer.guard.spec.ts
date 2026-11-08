import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AuthService } from './auth.service';
import { BearerGuard } from './bearer.guard';

describe('BearerGuard', () => {
  const authenticate = jest.fn<Promise<string>, [token: string]>();
  const token = 'a'.repeat(64);
  const accountId = '11111111-1111-4111-8111-111111111111';
  let guard: BearerGuard;
  let request: {
    headers: { authorization?: unknown };
    accountId?: string;
  };
  let context: ExecutionContext;

  beforeEach(() => {
    authenticate.mockReset();
    authenticate.mockResolvedValue(accountId);
    guard = new BearerGuard({ authenticate } as unknown as AuthService);
    request = { headers: {} };
    context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  });

  it.each(['Bearer ', 'bearer ', 'bEaReR ', 'Bearer   '])(
    'extracts the credential with prefix %j and assigns only the verified account',
    async (prefix) => {
      request.headers.authorization = `${prefix}${token}`;
      request.accountId = 'unverified-account';

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(authenticate).toHaveBeenCalledTimes(1);
      expect(authenticate).toHaveBeenCalledWith(token);
      expect(request.accountId).toBe(accountId);
    },
  );

  it.each([
    undefined,
    '',
    `Basic ${token}`,
    'Bearer',
    `Bearer ${token} extra`,
    `Bearer\t${token}`,
    [`Bearer ${token}`],
  ])('rejects an invalid authorization header (%j)', async (authorization) => {
    request.headers.authorization = authorization;

    const pending = guard.canActivate(context);
    await expect(pending).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(pending).rejects.toThrow('Credencial académica no válida');
    expect(authenticate).not.toHaveBeenCalled();
    expect(request.accountId).toBeUndefined();
  });

  it('does not assign an account when authentication fails', async () => {
    request.headers.authorization = `Bearer ${token}`;
    const error = new UnauthorizedException('Credencial académica no válida');
    authenticate.mockRejectedValue(error);

    await expect(guard.canActivate(context)).rejects.toBe(error);
    expect(request.accountId).toBeUndefined();
  });

  it('preserves a service failure without treating it as an invalid credential', async () => {
    request.headers.authorization = `Bearer ${token}`;
    const error = new Error('Database unavailable');
    authenticate.mockRejectedValue(error);

    await expect(guard.canActivate(context)).rejects.toBe(error);
    expect(request.accountId).toBeUndefined();
  });
});
