import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreateSyncSourceDto } from './dto/create-sync-source.dto';
import { SyncSourcesService } from './sync-sources.service';
import type { DatabaseService } from '../database/database.service';
import type { CredentialsService } from '../credentials/credentials.service';
import type { ConnectionTargetPolicyService } from './connection-target-policy.service';

describe('Atomic source setup boundary', () => {
  const input = {
    name: 'Gym',
    base_url: 'http://sport:3000/api/v1/activities/export',
    connector: 'standard.activities' as const,
    auth: { type: 'bearer' as const, token: 'fictional' },
    enabled: true,
  };
  it('validates nested Bearer credentials and rejects ownership or arbitrary connector fields', async () => {
    const valid = plainToInstance(CreateSyncSourceDto, input);
    expect(
      await validate(valid, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    const invalid = plainToInstance(CreateSyncSourceDto, {
      ...input,
      tenant_id: 'forged',
      connector: 'sport.specific',
    });
    expect(
      (await validate(invalid, { whitelist: true, forbidNonWhitelisted: true }))
        .length,
    ).toBeGreaterThan(0);
  });
  it('rejects an unauthorized target before any transaction and hides database/credential failures', async () => {
    const transaction = jest.fn();
    const database = { transaction } as unknown as DatabaseService;
    const assertAllowed = jest.fn().mockImplementation(() => {
      throw new BadRequestException('forbidden');
    });
    const targets = {
      assertAllowed,
    } as unknown as ConnectionTargetPolicyService;
    const service = new SyncSourcesService(
      database,
      {} as CredentialsService,
      targets,
    );
    await expect(service.create('verified-owner', input)).rejects.toThrow(
      'forbidden',
    );
    expect(transaction).not.toHaveBeenCalled();
    assertAllowed.mockReturnValue(new URL(input.base_url));
    transaction.mockRejectedValue(
      new Error('private credential and database details'),
    );
    await expect(service.create('verified-owner', input)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
