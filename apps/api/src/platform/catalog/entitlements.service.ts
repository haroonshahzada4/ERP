import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Tenant, TenantStatus } from '../tenants/entities/tenant.entity';
import {
  DEFAULT_PLAN_SLUG,
  PLATFORM_CATALOG,
} from './catalog.definitions';
import { PlanFeature } from './entities/plan-feature.entity';
import { Plan } from './entities/plan.entity';
import { PlatformFeature } from './entities/platform-feature.entity';
import { PlatformModule } from './entities/platform-module.entity';
import {
  Subscription,
  SubscriptionStatus,
} from './entities/subscription.entity';
import { TenantFeatureEntitlement } from './entities/tenant-feature-entitlement.entity';

type EntitlementSnapshot = {
  tenantId: number;
  tenantStatus: string;
  subscriptionStatus: string | null;
  planSlug: string | null;
  enabledFeatures: string[];
};

@Injectable()
export class EntitlementsService {
  private readonly cache = new Map<number, EntitlementSnapshot>();

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(PlatformModule)
    private readonly modules: Repository<PlatformModule>,
    @InjectRepository(PlatformFeature)
    private readonly features: Repository<PlatformFeature>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(PlanFeature)
    private readonly planFeatures: Repository<PlanFeature>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(TenantFeatureEntitlement)
    private readonly entitlements: Repository<TenantFeatureEntitlement>,
  ) {}

  invalidate(tenantId: number) {
    this.cache.delete(tenantId);
  }

  invalidateAll() {
    this.cache.clear();
  }

  async getSnapshot(tenantId: number): Promise<EntitlementSnapshot> {
    const cached = this.cache.get(tenantId);
    if (cached) return cached;

    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const sub = await this.subscriptions.findOne({
      where: { tenantId },
      relations: { plan: true },
    });

    const rows = await this.entitlements.find({
      where: { tenantId, enabled: true },
      relations: { feature: true },
    });

    let enabled = rows
      .map((r) => r.feature?.key)
      .filter((k): k is string => !!k);

    // If a module has zero enabled features, nothing to strip; if we later
    // track module-level disables, child features are already stored per-row.

    // Enforce dependencies: a feature is only usable if its dependency is on.
    enabled = this.applyDependencies(enabled);

    const snap: EntitlementSnapshot = {
      tenantId,
      tenantStatus: tenant.status,
      subscriptionStatus: sub?.status ?? null,
      planSlug: sub?.plan?.slug ?? null,
      enabledFeatures: enabled,
    };
    this.cache.set(tenantId, snap);
    return snap;
  }

  async assertFeatures(tenantId: number, required: string[]) {
    if (!required.length) return;
    const snap = await this.getSnapshot(tenantId);

    if (snap.tenantStatus !== TenantStatus.ACTIVE) {
      throw new ForbiddenException('Tenant is not active');
    }
    if (
      snap.subscriptionStatus &&
      snap.subscriptionStatus !== SubscriptionStatus.ACTIVE &&
      snap.subscriptionStatus !== SubscriptionStatus.TRIALING
    ) {
      throw new ForbiddenException('Subscription is not active');
    }

    const missing = required.filter((f) => !snap.enabledFeatures.includes(f));
    if (missing.length) {
      throw new ForbiddenException(
        `Feature not enabled for this tenant: ${missing.join(', ')}`,
      );
    }
  }

  async isFeatureEnabled(tenantId: number, featureKey: string) {
    const snap = await this.getSnapshot(tenantId);
    return snap.enabledFeatures.includes(featureKey);
  }

  async listCatalog() {
    const modules = await this.modules.find({
      where: { isActive: true },
      relations: { features: true },
      order: { sortOrder: 'ASC' },
    });
    return modules.map((m) => ({
      id: m.id,
      key: m.key,
      name: m.name,
      description: m.description,
      features: (m.features ?? [])
        .filter((f) => f.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((f) => ({
          id: f.id,
          key: f.key,
          name: f.name,
          description: f.description,
          dependsOnFeatureKey: f.dependsOnFeatureKey,
        })),
    }));
  }

  async getTenantEntitlements(tenantId: number) {
    const snap = await this.getSnapshot(tenantId);
    const catalog = await this.listCatalog();
    const rows = await this.entitlements.find({
      where: { tenantId },
      relations: { feature: true },
    });
    const byKey = new Map(rows.map((r) => [r.feature.key, r]));

    return {
      tenantId,
      tenantStatus: snap.tenantStatus,
      subscriptionStatus: snap.subscriptionStatus,
      planSlug: snap.planSlug,
      enabledFeatures: snap.enabledFeatures,
      modules: catalog.map((m) => ({
        ...m,
        features: m.features.map((f) => {
          const row = byKey.get(f.key);
          return {
            ...f,
            enabled: row?.enabled ?? false,
            source: row?.source ?? 'plan',
            effective: snap.enabledFeatures.includes(f.key),
          };
        }),
      })),
    };
  }

  /**
   * Super Admin overrides: set exact enabled feature keys for a tenant.
   * Disabling a parent module's features is done by omitting them.
   * Dependencies are validated (can't enable payroll without employees).
   */
  async setTenantFeatures(tenantId: number, enabledKeys: string[]) {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const unique = [...new Set(enabledKeys)];
    this.assertDependencyClosure(unique);

    const allFeatures = await this.features.find();
    const byKey = new Map(allFeatures.map((f) => [f.key, f]));
    for (const key of unique) {
      if (!byKey.has(key)) {
        throw new BadRequestException(`Unknown feature: ${key}`);
      }
    }

    const existing = await this.entitlements.find({ where: { tenantId } });
    const existingByFeature = new Map(existing.map((e) => [e.featureId, e]));

    for (const feature of allFeatures) {
      const shouldEnable = unique.includes(feature.key);
      const row = existingByFeature.get(feature.id);
      if (row) {
        row.enabled = shouldEnable;
        row.source = 'override';
        await this.entitlements.save(row);
      } else if (shouldEnable) {
        await this.entitlements.save(
          this.entitlements.create({
            tenantId,
            featureId: feature.id,
            enabled: true,
            source: 'override',
          }),
        );
      }
    }

    this.invalidate(tenantId);
    return this.getTenantEntitlements(tenantId);
  }

  async assignPlan(tenantId: number, planSlug: string) {
    const plan = await this.plans.findOne({
      where: { slug: planSlug, isActive: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    const links = await this.planFeatures.find({
      where: { planId: plan.id },
      relations: { feature: true },
    });
    const featureKeys = links.map((l) => l.feature.key);

    let sub = await this.subscriptions.findOne({ where: { tenantId } });
    if (!sub) {
      sub = this.subscriptions.create({
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        mrrCents: plan.priceMonthlyCents,
      });
    } else {
      sub.planId = plan.id;
      sub.status = SubscriptionStatus.ACTIVE;
      sub.mrrCents = plan.priceMonthlyCents;
      sub.currentPeriodStart = new Date();
      sub.currentPeriodEnd = new Date(Date.now() + 30 * 86400000);
    }
    await this.subscriptions.save(sub);

    // Replace plan-sourced entitlements; keep explicit overrides that are still
    // in the new plan, drop enabled plan features not in overrides.
    await this.entitlements.delete({ tenantId, source: 'plan' });
    const overrides = await this.entitlements.find({
      where: { tenantId, source: 'override' },
      relations: { feature: true },
    });
    const overrideKeys = new Set(overrides.map((o) => o.feature.key));

    const allFeatures = await this.features.find();
    const byKey = new Map(allFeatures.map((f) => [f.key, f]));

    for (const key of featureKeys) {
      if (overrideKeys.has(key)) continue;
      const feature = byKey.get(key);
      if (!feature) continue;
      await this.entitlements.save(
        this.entitlements.create({
          tenantId,
          featureId: feature.id,
          enabled: true,
          source: 'plan',
        }),
      );
    }

    // Disable override features that conflict? Keep overrides as Super Admin intent.
    this.invalidate(tenantId);
    return this.getTenantEntitlements(tenantId);
  }

  async ensureDefaultSubscription(tenantId: number, planSlug = DEFAULT_PLAN_SLUG) {
    const existing = await this.subscriptions.findOne({ where: { tenantId } });
    if (existing) return this.getTenantEntitlements(tenantId);
    return this.assignPlan(tenantId, planSlug);
  }

  async listPlans() {
    const plans = await this.plans.find({
      where: { isActive: true },
      relations: { planFeatures: { feature: true } },
      order: { sortOrder: 'ASC' },
    });
    return plans.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      priceMonthlyCents: p.priceMonthlyCents,
      currency: p.currency,
      featureKeys: (p.planFeatures ?? []).map((pf) => pf.feature.key),
    }));
  }

  async listSubscriptions() {
    const rows = await this.subscriptions.find({
      relations: { plan: true, tenant: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((s) => ({
      id: s.id,
      tenantId: s.tenantId,
      tenantSlug: s.tenant?.slug,
      tenantName: s.tenant?.name,
      planSlug: s.plan?.slug,
      planName: s.plan?.name,
      status: s.status,
      mrrCents: s.mrrCents,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
    }));
  }

  async platformStats() {
    const tenants = await this.tenants.find();
    const subs = await this.subscriptions.find();
    const activeSubs = subs.filter(
      (s) =>
        s.status === SubscriptionStatus.ACTIVE ||
        s.status === SubscriptionStatus.TRIALING,
    );
    const mrr = activeSubs.reduce((sum, s) => sum + s.mrrCents, 0);
    return {
      tenantsTotal: tenants.length,
      tenantsActive: tenants.filter((t) => t.status === TenantStatus.ACTIVE)
        .length,
      tenantsSuspended: tenants.filter(
        (t) => t.status === TenantStatus.SUSPENDED,
      ).length,
      subscriptionsActive: activeSubs.length,
      mrrCents: mrr,
      catalogModules: PLATFORM_CATALOG.length,
      catalogFeatures: PLATFORM_CATALOG.reduce(
        (n, m) => n + m.features.length,
        0,
      ),
    };
  }

  private applyDependencies(enabled: string[]) {
    const set = new Set(enabled);
    const dep = new Map<string, string | undefined>();
    for (const m of PLATFORM_CATALOG) {
      for (const f of m.features) dep.set(f.key, f.dependsOn);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const key of [...set]) {
        const need = dep.get(key);
        if (need && !set.has(need)) {
          set.delete(key);
          changed = true;
        }
      }
    }
    return [...set];
  }

  private assertDependencyClosure(keys: string[]) {
    const set = new Set(keys);
    for (const m of PLATFORM_CATALOG) {
      for (const f of m.features) {
        if (set.has(f.key) && f.dependsOn && !set.has(f.dependsOn)) {
          throw new BadRequestException(
            `Feature ${f.key} requires ${f.dependsOn}`,
          );
        }
      }
    }
  }

  /** Used by tests and internal checks. */
  async findFeaturesByKeys(keys: string[]) {
    if (!keys.length) return [];
    return this.features.find({ where: { key: In(keys) } });
  }
}
