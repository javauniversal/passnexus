import { INestApplication, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {
  async enableShutdownHooks(application: INestApplication) {
    process.once('beforeExit', async () => {
      await application.close();
    });
  }
}
