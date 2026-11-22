import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../src/auth/auth.service';
import { DatabaseService } from '../src/database/database.service';

describe('AuthService (integration)', () => {
  let module: TestingModule;
  let database: DatabaseService;
  let auth: AuthService;
  let accountId: string;
  let otherAccountId: string;
  let token: string;
  let otherToken: string;

  function hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [DatabaseService, AuthService],
    }).compile();
    await module.init();
    database = module.get(DatabaseService);
    auth = module.get(AuthService);
  });

  beforeEach(async () => {
    accountId = randomUUID();
    otherAccountId = randomUUID();
    token = randomBytes(32).toString('hex');
    otherToken = randomBytes(32).toString('hex');
    await database.query(
      `INSERT INTO academic.accounts (id, name, token_hash)
       VALUES ($1, 'Auth test A', $2), ($3, 'Auth test B', $4)`,
      [accountId, hash(token), otherAccountId, hash(otherToken)],
    );
  });

  afterEach(async () => {
    await database.query('DELETE FROM academic.accounts WHERE id IN ($1, $2)', [
      accountId,
      otherAccountId,
    ]);
  });

  afterAll(async () => {
    await module?.close();
  });

  it('identifies each account exclusively by its own credential', async () => {
    await expect(auth.authenticate(token)).resolves.toBe(accountId);
    await expect(auth.authenticate(otherToken)).resolves.toBe(otherAccountId);
  });

  it('keeps the credential hash in PostgreSQL rather than the raw token', async () => {
    const stored = await database.query<{ token_hash: string }>(
      'SELECT token_hash FROM academic.accounts WHERE id = $1',
      [accountId],
    );
    expect(stored.rows).toEqual([{ token_hash: hash(token) }]);
    expect(stored.rows[0].token_hash).not.toBe(token);
    await expect(auth.authenticate(token)).resolves.toBe(accountId);
  });

  it('rejects unknown credentials and prevents using the stored hash as a credential', async () => {
    for (const credential of [randomBytes(32).toString('hex'), hash(token)]) {
      const pending = auth.authenticate(credential);
      await expect(pending).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(pending).rejects.toThrow('Credencial académica no válida');
    }
  });

  it('rejects a disabled account immediately and permits access after re-enabling it', async () => {
    await database.query(
      'UPDATE academic.accounts SET enabled = false WHERE id = $1',
      [accountId],
    );
    const pending = auth.authenticate(token);
    await expect(pending).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(pending).rejects.toThrow('Credencial académica no válida');
    // Another account is unaffected by this account being disabled.
    await expect(auth.authenticate(otherToken)).resolves.toBe(otherAccountId);

    await database.query(
      'UPDATE academic.accounts SET enabled = true WHERE id = $1',
      [accountId],
    );
    await expect(auth.authenticate(token)).resolves.toBe(accountId);
  });

  it('stops accepting the previous credential when its hash is replaced', async () => {
    const replacement = randomBytes(32).toString('hex');
    await database.query(
      'UPDATE academic.accounts SET token_hash = $1 WHERE id = $2',
      [hash(replacement), accountId],
    );

    await expect(auth.authenticate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(auth.authenticate(replacement)).resolves.toBe(accountId);
    await expect(auth.authenticate(otherToken)).resolves.toBe(otherAccountId);
  });
});
