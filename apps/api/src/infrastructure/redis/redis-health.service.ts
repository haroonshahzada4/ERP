import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisHealthService {
  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async check(): Promise<{ status: 'ok' | 'skipped' | 'error'; detail?: string }> {
    if (!this.config.get<boolean>('redis.enabled') || !this.redis) {
      return { status: 'skipped', detail: 'REDIS_ENABLED=false' };
    }

    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect();
      }
      const pong = await this.redis.ping();
      return pong === 'PONG'
        ? { status: 'ok' }
        : { status: 'error', detail: `unexpected ping: ${pong}` };
    } catch (error) {
      return {
        status: 'error',
        detail: error instanceof Error ? error.message : 'redis unreachable',
      };
    }
  }
}
