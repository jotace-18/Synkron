import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { SyncServiceGuard } from './sync-service.guard';

describe('SyncServiceGuard', () => {
  const validToken = '1'.repeat(64);
  let previousToken: string | undefined;

  function contextWithToken(token?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          get: (name: string) =>
            name === 'X-Synkron-Service-Token' ? token : undefined,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    previousToken = process.env.SYNC_AUTH_SERVICE_TOKEN;
    process.env.SYNC_AUTH_SERVICE_TOKEN = validToken;
  });

  afterEach(() => {
    if (previousToken === undefined) {
      delete process.env.SYNC_AUTH_SERVICE_TOKEN;
    } else {
      process.env.SYNC_AUTH_SERVICE_TOKEN = previousToken;
    }
  });

  it('accepts the configured service token', () => {
    const guard = new SyncServiceGuard();

    expect(guard.canActivate(contextWithToken(validToken))).toBe(true);
  });

  it.each([
    { label: 'missing', token: undefined },
    { label: 'malformed', token: 'invalid' },
    { label: 'non-hexadecimal', token: 'z'.repeat(64) },
    { label: 'incorrect', token: '2'.repeat(64) },
  ])('rejects a $label token', ({ token }) => {
    const guard = new SyncServiceGuard();

    expect(() => guard.canActivate(contextWithToken(token))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects missing server configuration', () => {
    delete process.env.SYNC_AUTH_SERVICE_TOKEN;

    expect(() => new SyncServiceGuard()).toThrow('SYNC_AUTH_SERVICE_TOKEN');
  });

  it('rejects malformed server configuration', () => {
    process.env.SYNC_AUTH_SERVICE_TOKEN = 'invalid';

    expect(() => new SyncServiceGuard()).toThrow('SYNC_AUTH_SERVICE_TOKEN');
  });
});
