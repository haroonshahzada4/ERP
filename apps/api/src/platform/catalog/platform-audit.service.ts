import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformAuditLog } from './entities/platform-audit-log.entity';

@Injectable()
export class PlatformAuditService {
  constructor(
    @InjectRepository(PlatformAuditLog)
    private readonly logs: Repository<PlatformAuditLog>,
  ) {}

  async log(input: {
    actorUserId?: number | null;
    actorEmail?: string | null;
    action: string;
    resourceType: string;
    resourceId?: number | null;
    tenantId?: number | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
  }) {
    return this.logs.save(
      this.logs.create({
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        tenantId: input.tenantId ?? null,
        metadata: input.metadata ?? null,
        ip: input.ip ?? null,
      }),
    );
  }

  async list(limit = 50) {
    const rows = await this.logs.find({
      order: { createdAt: 'DESC' },
      take: Math.min(200, limit),
    });
    return rows;
  }
}
