import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginAccountDto } from './login-account.dto';

describe('LoginAccountDto', () => {
  it('normalizes email and preserves the password without enforcing registration length', async () => {
    const dto = plainToInstance(LoginAccountDto, {
      email: ' Persona@Example.com ',
      password: ' x ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('persona@example.com');
    expect(dto.password).toBe(' x ');
  });

  it.each(['', 123, 'a'.repeat(129)])(
    'rejects an invalid login password',
    async (password) => {
      const dto = plainToInstance(LoginAccountDto, {
        email: 'persona@example.com',
        password,
      });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    },
  );
});
