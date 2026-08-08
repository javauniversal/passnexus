import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'passnexus-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
