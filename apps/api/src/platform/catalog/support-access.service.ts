import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { permissionsForFeatures } from './catalog.definitions';
import { PlatformAuditService } from './platform-audit.service';
import {
  SupportAccessRequest,
  SupportAccessStatus,
} from './entities/support-access-request.entity';

const SENSITIVE_PERMISSIONS = new Set([
  'payroll.view',
  'payroll.generate',
  'payroll.approve.hr',
  'payroll.approve.ceo',
]);

@Injectable()
export class SupportAccessService {
  constructor(
    @InjectRepository(SupportAccessRequest)
    private readonly requests: Repository<SupportAccessRequest>,
    private readonly audit: PlatformAuditService,
  ) {}

  async list(tenantId?: number) {
    const where = tenantId ? { tenantId } : {};
    const rows = await this.requests.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
      relations: { tenant: true, requester: true },
    });
    return rows.map((r) => this.toDto(r));
  }

  async requestAccess(input: {
    tenantId: number;
    requesterUserId: number;
    reason: string;
    featureKeys: string[];
    expiresAt: Date;
    emergency?: boolean;
    actorEmail?: string;
  }) {
    if (!input.featureKeys.length) {
      throw new BadRequestException('Select at least one feature');
    }
    if (input.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future');
    }
    // Cap at 72h for normal, 8h for emergency.
    const maxMs = (input.emergency ? 8 : 72) * 3600_000;
    if (input.expiresAt.getTime() - Date.now() > maxMs) {
      throw new BadRequestException(
        input.emergency
          ? 'Emergency access max duration is 8 hours'
          : 'Support access max duration is 72 hours',
      );
    }

    let permissionKeys = permissionsForFeatures(input.featureKeys);
    // Never grant sensitive payroll by default unless explicitly requested via feature.
    if (!input.featureKeys.includes('hrm.payroll')) {
      permissionKeys = permissionKeys.filter((p) => !SENSITIVE_PERMISSIONS.has(p));
    }

    const row = await this.requests.save(
      this.requests.create({
        tenantId: input.tenantId,
        requesterUserId: input.requesterUserId,
        reason: input.reason,
        featureKeys: input.featureKeys,
        permissionKeys,
        emergency: !!input.emergency,
        expiresAt: input.expiresAt,
        status: input.emergency
          ? SupportAccessStatus.APPROVED
          : SupportAccessStatus.PENDING,
        decidedAt: input.emergency ? new Date() : null,
        decisionNote: input.emergency
          ? 'Emergency access auto-approved (audited)'
          : null,
      }),
    );

    await this.audit.log({
      actorUserId: input.requesterUserId,
      actorEmail: input.actorEmail,
      action: input.emergency
        ? 'support.emergency_granted'
        : 'support.requested',
      resourceType: 'support_access',
      resourceId: row.id,
      tenantId: input.tenantId,
      metadata: {
        featureKeys: input.featureKeys,
        expiresAt: input.expiresAt.toISOString(),
      },
    });

    return this.toDto(row);
  }

  async decide(
    id: number,
    input: {
      approve: boolean;
      decidedByUserId: number;
      note?: string;
      actorEmail?: string;
    },
  ) {
    const row = await this.requests.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Request not found');
    if (row.status !== SupportAccessStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }
    row.status = input.approve
      ? SupportAccessStatus.APPROVED
      : SupportAccessStatus.DENIED;
    row.decidedByUserId = input.decidedByUserId;
    row.decidedAt = new Date();
    row.decisionNote = input.note ?? null;
    await this.requests.save(row);

    await this.audit.log({
      actorUserId: input.decidedByUserId,
      actorEmail: input.actorEmail,
      action: input.approve ? 'support.approved' : 'support.denied',
      resourceType: 'support_access',
      resourceId: row.id,
      tenantId: row.tenantId,
      metadata: { note: input.note },
    });

    return this.toDto(row);
  }

  async revoke(id: number, actorUserId: number, actorEmail?: string) {
    const row = await this.requests.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Request not found');
    if (row.status !== SupportAccessStatus.APPROVED) {
      throw new BadRequestException('Only approved grants can be revoked');
    }
    row.status = SupportAccessStatus.REVOKED;
    row.decidedAt = new Date();
    await this.requests.save(row);
    await this.audit.log({
      actorUserId,
      actorEmail,
      action: 'support.revoked',
      resourceType: 'support_access',
      resourceId: row.id,
      tenantId: row.tenantId,
    });
    return this.toDto(row);
  }

  async getActiveGrant(userId: number, tenantId: number) {
    const rows = await this.requests.find({
      where: {
        requesterUserId: userId,
        tenantId,
        status: SupportAccessStatus.APPROVED,
      },
      order: { createdAt: 'DESC' },
    });
    const now = Date.now();
    for (const row of rows) {
      if (row.expiresAt.getTime() <= now) {
        row.status = SupportAccessStatus.EXPIRED;
        await this.requests.save(row);
        continue;
      }
      return row;
    }
    return null;
  }

  /** Merge temporary support permissions into the auth user for this tenant. */
  async augmentPermissions(
    userId: number,
    tenantId: number,
    isPlatformAdmin: boolean,
    basePermissions: string[],
  ) {
    if (!isPlatformAdmin) return basePermissions;
    const grant = await this.getActiveGrant(userId, tenantId);
    if (!grant) return basePermissions;
    return [...new Set([...basePermissions, ...grant.permissionKeys])];
  }

  assertNotUnrestricted(featureKeys: string[]) {
    if (featureKeys.includes('*')) {
      throw new ForbiddenException('Unrestricted support access is not allowed');
    }
  }

  private toDto(r: SupportAccessRequest) {
    return {
      id: r.id,
      tenantId: r.tenantId,
      tenantSlug: r.tenant?.slug,
      tenantName: r.tenant?.name,
      requesterUserId: r.requesterUserId,
      requesterEmail: r.requester?.email,
      status: r.status,
      reason: r.reason,
      featureKeys: r.featureKeys,
      permissionKeys: r.permissionKeys,
      emergency: r.emergency,
      expiresAt: r.expiresAt,
      decidedAt: r.decidedAt,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt,
    };
  }
}
