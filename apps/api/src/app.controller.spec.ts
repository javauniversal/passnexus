import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('returns an available service status', () => {
      const health = appController.getHealth();

      expect(health).toEqual(
        expect.objectContaining({
          service: 'passnexus-api',
          status: 'ok',
        }),
      );
      expect(health.timestamp).toEqual(expect.any(String));
    });
  });
});
