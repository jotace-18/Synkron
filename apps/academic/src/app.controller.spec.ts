import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';

describe('AppController', () => {
  let appController: AppController;
  const checkConnection = jest.fn<Promise<void>, []>();

  beforeEach(async () => {
    checkConnection.mockReset();
    checkConnection.mockResolvedValue(undefined);
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: DatabaseService, useValue: { checkConnection } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('returns the service and database status', async () => {
      await expect(appController.getHealth()).resolves.toEqual({
        status: 'ok',
        service: 'academic',
        database: 'up',
      });
      expect(checkConnection).toHaveBeenCalledTimes(1);
    });

    it('reports an unavailable database without exposing its error', async () => {
      checkConnection.mockRejectedValue(
        new Error('Private connection details'),
      );
      const result = appController.getHealth();
      await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(result).rejects.toThrow('PostgreSQL no está disponible');
    });
  });
});
