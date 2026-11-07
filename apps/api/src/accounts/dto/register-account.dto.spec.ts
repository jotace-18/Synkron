import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterAccountDto } from './register-account.dto';

describe('RegisterAccountDto', () => {
  const validInput = {
    email: 'persona@example.com',
    password: ' clave con espacios ',
  };

  it('normalizes the email and preserves the password', async () => {
    const dto = plainToInstance(RegisterAccountDto, {
      ...validInput,
      email: ' Persona@Example.com ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('persona@example.com');
    expect(dto.password).toBe(validInput.password);
  });

  it.each([
    {
      name: 'an invalid email',
      body: { ...validInput, email: 'sin-correo' },
    },
    {
      name: 'a short password',
      body: { ...validInput, password: 'a'.repeat(14) },
    },
    {
      name: 'a long password',
      body: { ...validInput, password: 'a'.repeat(129) },
    },
    {
      name: 'additional fields',
      body: { ...validInput, admin: true },
    },
  ])('rejects $name', async ({ body }) => {
    const dto = plainToInstance(RegisterAccountDto, body);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.length).toBeGreaterThan(0);
  });
});
