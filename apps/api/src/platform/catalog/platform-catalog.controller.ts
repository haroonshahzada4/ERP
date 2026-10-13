import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequirePlatformAdmin } from '../../common/decorators/platform-admin.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { getTenantContext } from '../../common/tenant/tenant-context';
import { TENANT_FULL_ACCESS_PERMISSION } from '../../modules/access/system-roles';
import { EntitlementsService } from './entitlements.service';
import { PlatformAuditService } from './platform-audit.service';
import { SupportAccessService } from './support-access.service';

class SetFeaturesDto {
  featureKeys!: string[];
}

class AssignPlanDto {
  planSlug!: string;
}

class SupportRequestDto {
  tenantId!: number;
  reason!: string;
  featureKeys!: string[];
  expiresAt!: string;
  emergency?: boolean;
}

class SupportDecideDto {
  approve!: boolean;
  note?: string;
}

@ApiTags('platform/catalog')
@ApiBearerAuth()
@Controller('platform')
export class PlatformCatalogController {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly support: SupportAccessService,
    private readonly audit: PlatformAuditService,
  ) {}

  @Get('analytics/overview')
  @RequirePlatformAdmin()
  @ApiOperation({ summary: 'Platform dashboard stats' })
  analytics() {
    return this.entitlements.platformStats();
  }

  @Get('health/summary')
  @RequirePlatformAdmin()
  healthSummary() {
    return this.entitlements.platformStats();
  }

  @Get('catalog')
  @RequirePlatformAdmin()
  catalog() {
    return this.entitlements.listCatalog();
  }

  @Public()
  @Get('entitlements/current')
  @ApiOperation({ summary: 'Enabled features for host-resolved tenant' })
  async currentEntitlements() {
    const ctx = getTenantContext();
    if (!ctx) return { enabledFeatures: [] as string[], planSlug: null };
    const snap = await this.entitlements.getSnapshot(ctx.tenantId);
    return {
      enabledFeatures: snap.enabledFeatures,
      planSlug: snap.planSlug,
      subscriptionStatus: snap.subscriptionStatus,
      tenantStatus: snap.tenantStatus,
    };
  }

  @Get('entitlements/:tenantId')
  @RequirePlatformAdmin()
  tenantEntitlements(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.entitlements.getTenantEntitlements(tenantId);
  }

  @Patch('entitlements/:tenantId')
  @RequirePlatformAdmin()
  async setEntitlements(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: SetFeaturesDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.entitlements.setTenantFeatures(
      tenantId,
      dto.featureKeys ?? [],
    );
    await this.audit.log({
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'entitlements.updated',
      resourceType: 'tenant',
      resourceId: tenantId,
      tenantId,
      metadata: { featureKeys: dto.featureKeys },
    });
    return result;
  }

  @Get('plans')
  @RequirePlatformAdmin()
  plans() {
    return this.entitlements.listPlans();
  }

  @Get('subscriptions')
  @RequirePlatformAdmin()
  subscriptions() {
    return this.entitlements.listSubscriptions();
  }

  @Post('tenants/:tenantId/subscription')
  @RequirePlatformAdmin()
  async assignSubscription(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: AssignPlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.entitlements.assignPlan(tenantId, dto.planSlug);
    await this.audit.log({
      actorUserId: user.userId,
      actorEmail: user.email,
      action: 'subscription.assigned',
      resourceType: 'tenant',
      resourceId: tenantId,
      tenantId,
      metadata: { planSlug: dto.planSlug },
    });
    return result;
  }

  @Get('support-access')
  @RequirePlatformAdmin()
  listSupport(@Query('tenantId') tenantId?: number) {
    return this.support.list(tenantId);
  }

  @Post('support-access')
  @RequirePlatformAdmin()
  requestSupport(
    @Body() dto: SupportRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.support.assertNotUnrestricted(dto.featureKeys ?? []);
    return this.support.requestAccess({
      tenantId: dto.tenantId,
      requesterUserId: user.userId,
      reason: dto.reason,
      featureKeys: dto.featureKeys,
      expiresAt: new Date(dto.expiresAt),
      emergency: dto.emergency,
      actorEmail: user.email,
    });
  }

  @Post('support-access/:id/decide')
  @RequirePlatformAdmin()
  decideSupport(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SupportDecideDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.support.decide(id, {
      approve: dto.approve,
      decidedByUserId: user.userId,
      note: dto.note,
      actorEmail: user.email,
    });
  }

  @Post('support-access/:id/revoke')
  @RequirePlatformAdmin()
  revokeSupport(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.support.revoke(id, user.userId, user.email);
  }

  @Get('support-access/inbox')
  @RequirePermissions(TENANT_FULL_ACCESS_PERMISSION)
  async supportInbox() {
    const ctx = getTenantContext();
    if (!ctx) return [];
    return this.support.list(ctx.tenantId);
  }

  @Post('support-access/:id/company-decide')
  @RequirePermissions(TENANT_FULL_ACCESS_PERMISSION)
  async companyDecide(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SupportDecideDto,
    @CurrentUser() user: AuthUser,
  ) {
    const ctx = getTenantContext();
    if (!ctx) throw new ForbiddenException('Tenant required');
    const list = await this.support.list(ctx.tenantId);
    if (!list.some((r) => r.id === id)) {
      throw new ForbiddenException('Request not in this tenant');
    }
    return this.support.decide(id, {
      approve: dto.approve,
      decidedByUserId: user.userId,
      note: dto.note,
      actorEmail: user.email,
    });
  }

  @Get('audit-logs')
  @RequirePlatformAdmin()
  auditLogs(@Query('limit') limit?: string) {
    return this.audit.list(limit ? Number(limit) : 50);
  }
}
