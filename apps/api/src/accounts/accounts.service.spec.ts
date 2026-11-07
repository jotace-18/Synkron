import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { DatabaseError } from 'pg';
import { AccountsService } from './accounts.service';
import { DatabaseService } from '../database/database.service';

describe('AccountsService', () => {
  it('normalizes the email and stores an Argon2id hash', async () => {
    const account = {
      id: '44444444-4444-4444-8444-444444444444',
      email: 'persona@example.com',
      created_at: new Date('2026-11-07T12:00:00Z'),
    };

    const query = jest
      .fn<Promise<{ rows: Array<typeof account> }>, [string, string[]]>()
      .mockResolvedValue({ rows: [account] });

    const testingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: DatabaseService, useValue: { query } },
      ],
    }).compile();

    const service = testingModule.get(AccountsService);
    const password = 'clave-ficticia-para-la-prueba';

    const result = await service.register(' Persona@Example.com ', password);

    expect(query).toHaveBeenCalledTimes(1);

    const [email, hash] = query.mock.calls[0][1];

    expect(email).toBe('persona@example.com');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(hash, password)).toBe(true);
    expect(result).toEqual(account);
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('password_hash');
  });

  it('rejects an email that is already registered', async () => {
    const error = new DatabaseError('Duplicate email', 0, 'error');
    error.code = '23505';
    error.constraint = 'users_email_key';

    const query = jest.fn().mockRejectedValue(error);

    const testingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: DatabaseService, useValue: { query } },
      ],
    }).compile();

    const service = testingModule.get(AccountsService);

    await expect(
      service.register('persona@example.com', 'clave-ficticia'),
    ).rejects.toThrow(ConflictException);
  });

  it('propagates unexpected database errors', async () => {
    const error = new Error('Database connection failed');
    const query = jest.fn().mockRejectedValue(error);

    const testingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: DatabaseService, useValue: { query } },
      ],
    }).compile();

    const service = testingModule.get(AccountsService);

    await expect(
      service.register('persona@example.com', 'clave-ficticia'),
    ).rejects.toBe(error);
  });
});
