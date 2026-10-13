import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      name: 'ERP SaaS API',
      version: '0.1.0',
      orm: 'TypeORM',
      status: 'ok',
      phase: '2',
    };
  }
}
