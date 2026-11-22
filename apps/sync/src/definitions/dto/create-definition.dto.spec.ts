import 'reflect-metadata';
import {
  HttpException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { configureApp } from '../../configure-app';
import { CreateDefinitionDto } from './create-definition.dto';

describe('CreateDefinitionDto', () => {
  const validInput = {
    name: '  Centralizar entregas  ',
    source_connection_id: 'a80c9d4d-d28c-4ade-bb0b-8907af8b9e46',
    connector: 'academic.assignments',
  };
  const options = { whitelist: true, forbidNonWhitelisted: true };

  function configuredPipe(): ValidationPipe {
    const useGlobalPipes = jest.fn<void, [ValidationPipe]>();
    configureApp({ useGlobalPipes } as unknown as INestApplication);
    const pipe: unknown = useGlobalPipes.mock.calls[0][0];
    if (!(pipe instanceof ValidationPipe))
      throw new Error('Expected the application validation pipe');
    return pipe;
  }

  it('normalizes the name, requires the source and connector and enables the definition by default', async () => {
    const dto = plainToInstance(CreateDefinitionDto, validInput);
    expect(await validate(dto, options)).toHaveLength(0);
    expect(dto).toEqual({
      ...validInput,
      name: 'Centralizar entregas',
      enabled: true,
    });
  });

  it.each([true, false])(
    'preserves an explicit boolean enabled value: %s',
    async (enabled) => {
      const dto = plainToInstance(CreateDefinitionDto, {
        ...validInput,
        enabled,
      });
      expect(await validate(dto, options)).toHaveLength(0);
      expect(dto.enabled).toBe(enabled);
    },
  );

  it.each(['X', 'x'.repeat(100), `  ${'x'.repeat(100)}  `, '📚'.repeat(100)])(
    'accepts a nonblank name within 100 characters after normalization: %s',
    async (name) => {
      const dto = plainToInstance(CreateDefinitionDto, { ...validInput, name });
      expect(await validate(dto, options)).toHaveLength(0);
      expect(dto.name).toBe(name.trim());
    },
  );

  it('accepts a valid uppercase UUID without silently altering the supplied reference', async () => {
    const source_connection_id = validInput.source_connection_id.toUpperCase();
    const dto = plainToInstance(CreateDefinitionDto, {
      ...validInput,
      source_connection_id,
    });
    expect(await validate(dto, options)).toHaveLength(0);
    expect(dto.source_connection_id).toBe(source_connection_id);
  });

  it.each([
    '',
    ' \t\n',
    null,
    123,
    false,
    [],
    {},
    'x'.repeat(101),
    '📚'.repeat(101),
  ])('rejects an invalid name: %j', async (name) => {
    const dto = plainToInstance(CreateDefinitionDto, { ...validInput, name });
    expect(
      (await validate(dto, options)).some((error) => error.property === 'name'),
    ).toBe(true);
  });

  it.each([
    'not-a-uuid',
    'a80c9d4d-d28c-1ade-bb0b-8907af8b9e46',
    'a80c9d4d-d28c-4ade-0b0b-8907af8b9e46',
    '00000000-0000-0000-0000-000000000000',
    null,
    123,
    {},
    ` ${validInput.source_connection_id} `,
  ])(
    'rejects a connection reference that is not an exact UUID v4: %j',
    async (source_connection_id) => {
      const dto = plainToInstance(CreateDefinitionDto, {
        ...validInput,
        source_connection_id,
      });
      expect(
        (await validate(dto, options)).some(
          (error) => error.property === 'source_connection_id',
        ),
      ).toBe(true);
    },
  );

  it.each([
    'sport.tasks',
    '',
    null,
    123,
    ' academic.assignments ',
    'Academic.Assignments',
  ])('rejects an unsupported or malformed connector: %j', async (connector) => {
    const dto = plainToInstance(CreateDefinitionDto, {
      ...validInput,
      connector,
    });
    expect(
      (await validate(dto, options)).some(
        (error) => error.property === 'connector',
      ),
    ).toBe(true);
  });

  it.each([null, 'false', 'true', 0, 1, {}, []])(
    'rejects enabled without coercing non-booleans: %j',
    async (enabled) => {
      const dto = plainToInstance(CreateDefinitionDto, {
        ...validInput,
        enabled,
      });
      expect(
        (await validate(dto, options)).some(
          (error) => error.property === 'enabled',
        ),
      ).toBe(true);
    },
  );

  it.each(['name', 'source_connection_id', 'connector'])(
    'rejects an omitted required field: %s',
    async (field) => {
      const body: Record<string, unknown> = { ...validInput };
      delete body[field];
      const dto = plainToInstance(CreateDefinitionDto, body);
      expect(
        (await validate(dto, options)).some(
          (error) => error.property === field,
        ),
      ).toBe(true);
    },
  );

  it.each([
    'tenant_id',
    'id',
    'created_at',
    'updated_at',
    'source_collection',
    'credentials_encrypted',
    'token',
    'target_connection_id',
    'mappings',
    'source',
    'schedule',
    'unknown',
  ])('rejects an extra or server-controlled field: %s', async (field) => {
    const dto = plainToInstance(CreateDefinitionDto, {
      ...validInput,
      [field]: 'client-value',
    });
    const errors = await validate(dto, options);
    expect(
      errors.some(
        (error) =>
          error.property === field &&
          error.constraints?.whitelistValidation !== undefined,
      ),
    ).toBe(true);
  });

  it('uses the real application pipe to produce the normalized DTO with defaults', async () => {
    const dto: unknown = await configuredPipe().transform(validInput, {
      type: 'body',
      metatype: CreateDefinitionDto,
    });
    expect(dto).toBeInstanceOf(CreateDefinitionDto);
    expect(dto).toEqual({
      ...validInput,
      name: 'Centralizar entregas',
      enabled: true,
    });
  });

  it.each([null, [], 'not-an-object', {}])(
    'rejects a missing or malformed body with HTTP 422: %j',
    async (body) => {
      await expect(
        configuredPipe().transform(body, {
          type: 'body',
          metatype: CreateDefinitionDto,
        }),
      ).rejects.toMatchObject({ status: 422 });
    },
  );

  it('rejects extra fields with HTTP 422 instead of silently stripping ownership', async () => {
    await expect(
      configuredPipe().transform(
        { ...validInput, tenant_id: 'client-selected-owner' },
        { type: 'body', metatype: CreateDefinitionDto },
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('does not return the request object or invalid values in validation error metadata', async () => {
    const marker = 'private-request-value';
    let caught: unknown;
    try {
      await configuredPipe().transform(
        { ...validInput, enabled: marker },
        { type: 'body', metatype: CreateDefinitionDto },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect(
      JSON.stringify((caught as HttpException).getResponse()),
    ).not.toContain(marker);
  });
});
