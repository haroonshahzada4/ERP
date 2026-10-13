import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisHealthService } from './redis-health.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (!config.get<boolean>('redis.enabled')) {
          return null;
        }
        return new Redis({
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        });
      },
    },
    RedisHealthService,
  ],
  exports: [REDIS_CLIENT, RedisHealthService],
})
export class RedisModule {}
