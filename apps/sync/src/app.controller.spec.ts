import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';

describe('AppController', () => {
  let appController: AppController;
  let checkConnection: jest.Mock;

  beforeEach(async () => {
    checkConnection = jest.fn().mockResolvedValue(undefined);

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DatabaseService,
          useValue: { checkConnection },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('returns the service status', async () => {
      await expect(appController.getHealth()).resolves.toEqual({
        status: 'ok',
        service: 'sync',
        database: 'up',
      });
    });

    it('rejects when the database is unavailable', async () => {
      checkConnection.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(appController.getHealth()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
