import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { SourceRegisterDto } from './source-identity.controller';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { SourceIdentityService } from './source-identity.service';
import { digest, hashPassword, verifyPassword } from './identity-crypto';
import { DatabaseService } from '../database/database.service';
import { BearerGuard } from './bearer.guard';
import { AuthService } from './auth.service';
import type { ExecutionContext } from '@nestjs/common';

describe('Source browser identity and integration credentials', () => {
  it('authenticates browser writes before CSRF and preserves dependency errors', async () => {
    const session = jest
      .fn()
      .mockRejectedValue(new UnauthorizedException('Inicia sesión'));
    const checkWrite = jest.fn();
    const guard = new BearerGuard(
      {} as AuthService,
      { session, checkWrite } as unknown as SourceIdentityService,
    );
    const request: {
      headers: object;
      path: string;
      method: string;
      accountId?: string;
    } = { headers: {}, path: '/api/v1/events', method: 'PATCH' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      message: 'Credencial académica no válida',
    });
    expect(checkWrite).not.toHaveBeenCalled();
    expect(request.accountId).toBeUndefined();

    const unavailable = new Error('Database unavailable');
    session.mockRejectedValueOnce(unavailable);
    await expect(guard.canActivate(context)).rejects.toBe(unavailable);
    expect(checkWrite).not.toHaveBeenCalled();

    session.mockResolvedValue({ id: 'verified-account' });
    checkWrite.mockImplementationOnce(() => {
      throw new ForbiddenException('Token CSRF no válido');
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
    });
    expect(request.accountId).toBeUndefined();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.accountId).toBe('verified-account');
    expect(session.mock.invocationCallOrder[0]).toBeLessThan(
      checkWrite.mock.invocationCallOrder[0],
    );
  });

  it('bounds registration passwords and rejects non-string values before hashing', async () => {
    for (const password of [
      'a'.repeat(7),
      'a'.repeat(129),
      Array(20).fill('a'),
    ]) {
      const errors = await validate(
        Object.assign(new SourceRegisterDto(), {
          email: 'owner@example.test',
          password,
        }),
      );
      expect(errors.some((error) => error.property === 'password')).toBe(true);
    }
  });

  it('accepts registration passwords from 8 through 128 characters', async () => {
    for (const length of [8, 128]) {
      const errors = await validate(
        Object.assign(new SourceRegisterDto(), {
          email: 'owner@example.test',
          password: 'a'.repeat(length),
        }),
      );
      expect(errors).toHaveLength(0);
    }
  });

  it('salts passwords and rejects wrong passwords and nonexistent identities with a real derivation', async () => {
    const password = 'A personal password for testing';
    const a = await hashPassword(password),
      b = await hashPassword(password);
    expect(a).not.toBe(b);
    expect(a).not.toContain(password);
    await expect(verifyPassword(password, a)).resolves.toBe(true);
    await expect(verifyPassword('wrong', a)).resolves.toBe(false);
    await expect(verifyPassword(password)).resolves.toBe(false);
  });
  it('binds CSRF to this source session and an explicitly allowed origin', () => {
    const oldSecret = process.env.CSRF_SECRET,
      oldOrigins = process.env.SOURCE_APP_ORIGINS;
    process.env.CSRF_SECRET = randomBytes(32).toString('hex');
    process.env.SOURCE_APP_ORIGINS = 'http://localhost:3105';
    try {
      const service = new SourceIdentityService({} as DatabaseService);
      const cookies: Record<string, string> = {};
      const response = {
        cookie: (name: string, value: string) => {
          cookies[name] = value;
        },
      } as unknown as Response;
      const request = {
        headers: { origin: 'http://localhost:3105' },
      } as unknown as Request;
      const issued = service.issueCsrf(request, response);
      request.headers.cookie = Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      request.headers['x-csrf-token'] = issued.csrf_token;
      expect(() => service.checkWrite(request)).not.toThrow();
      request.headers.origin = 'https://attacker.example';
      expect(() => service.checkWrite(request)).toThrow('Origen no permitido');
      request.headers.origin = 'http://localhost:3105';
      request.headers.cookie +=
        '; synkron_academic_session=' + randomBytes(32).toString('hex');
      expect(() => service.checkWrite(request)).toThrow('Token CSRF no válido');
    } finally {
      if (oldSecret === undefined) delete process.env.CSRF_SECRET;
      else process.env.CSRF_SECRET = oldSecret;
      if (oldOrigins === undefined) delete process.env.SOURCE_APP_ORIGINS;
      else process.env.SOURCE_APP_ORIGINS = oldOrigins;
    }
  });
  it('keeps exports bearer-only, including case/trailing-slash variants, and passes write scope checks', async () => {
    const authenticate = jest.fn().mockResolvedValue('account');
    const session = jest
      .fn()
      .mockResolvedValue({ id: 'account', email: 'owner@example.test' });
    const checkWrite = jest.fn();
    const guard = new BearerGuard(
      { authenticate } as unknown as AuthService,
      { session, checkWrite } as unknown as SourceIdentityService,
    );
    const request = { headers: {}, path: '/api/v1/events', method: 'GET' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    for (const path of ['/api/v1/events/export', '/api/v1/events/EXPORT/']) {
      request.path = path;
      await expect(guard.canActivate(context)).rejects.toThrow();
    }
    request.headers = {
      authorization: 'Bearer ' + 'a'.repeat(64),
    };
    request.method = 'POST';
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('a'.repeat(64), true);
    expect(digest('a'.repeat(64))).toHaveLength(64);
  });
});
