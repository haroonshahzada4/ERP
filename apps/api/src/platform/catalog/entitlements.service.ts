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

    // Enforce dependencies from live catalog (includes Super Admin–added features).
    const catalogFeatures = await this.features.find({
      select: ['key', 'dependsOnFeatureKey'],
    });
    enabled = this.applyDependencies(
      enabled,
      catalogFeatures.map((f) => ({
        key: f.key,
        dependsOn: f.dependsOnFeatureKey ?? undefined,
      })),
    );

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

  async listCatalog(opts?: { includeInactive?: boolean }) {
    const includeInactive = !!opts?.includeInactive;
    const modules = await this.modules.find({
      relations: { features: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return modules
      .filter((m) => includeInactive || m.isActive)
      .map((m) => ({
        id: m.id,
        key: m.key,
        name: m.name,
        description: m.description,
        isActive: m.isActive,
        sortOrder: m.sortOrder,
        featureCount: (m.features ?? []).filter(
          (f) => includeInactive || f.isActive,
        ).length,
        features: (m.features ?? [])
          .filter((f) => includeInactive || f.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
          .map((f) => ({
            id: f.id,
            key: f.key,
            name: f.name,
            description: f.description,
            dependsOnFeatureKey: f.dependsOnFeatureKey,
            isActive: f.isActive,
            sortOrder: f.sortOrder,
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
   * Disabling a parent is done by omitting it (dependents must also be off).
   * Every catalog feature gets an explicit override row so enable/disable sticks.
   */
  async setTenantFeatures(tenantId: number, enabledKeys: string[]) {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new BadRequestException(
        `Cannot change features while "${tenant.name}" is suspended. Activate the tenant first.`,
      );
    }
    if (
      tenant.status === TenantStatus.PROVISIONING ||
      tenant.status === TenantStatus.FAILED
    ) {
      throw new BadRequestException(
        `Cannot change features while "${tenant.name}" is still provisioning (status: ${tenant.status}).`,
      );
    }

    const before = await this.getSnapshot(tenantId);
    const unique = [...new Set(enabledKeys.map((k) => k.trim()).filter(Boolean))];
    await this.assertDependencyClosure(unique);

    const allFeatures = await this.features.find({ where: { isActive: true } });
    const byKey = new Map(allFeatures.map((f) => [f.key, f]));
    for (const key of unique) {
      if (!byKey.has(key)) {
        throw new BadRequestException(
          `Unknown feature key "${key}". Refresh the catalog and try again.`,
        );
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
      } else {
        await this.entitlements.save(
          this.entitlements.create({
            tenantId,
            featureId: feature.id,
            enabled: shouldEnable,
            source: 'override',
          }),
        );
      }
    }

    this.invalidate(tenantId);
    const entitlements = await this.getTenantEntitlements(tenantId);
    const after = new Set(entitlements.enabledFeatures);
    const beforeSet = new Set(before.enabledFeatures);
    const enabled = entitlements.enabledFeatures.filter((k) => !beforeSet.has(k));
    const disabled = before.enabledFeatures.filter((k) => !after.has(k));

    const parts: string[] = [];
    if (enabled.length) parts.push(`enabled ${enabled.join(', ')}`);
    if (disabled.length) parts.push(`disabled ${disabled.join(', ')}`);
    const changeSummary =
      parts.length > 0 ? parts.join('; ') : 'no feature changes';

    return {
      ...entitlements,
      enabled,
      disabled,
      message: `Features updated for ${tenant.name}: ${changeSummary}.`,
    };
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

    // Keep existing Super Admin overrides as intentional.
    this.invalidate(tenantId);
    const entitlements = await this.getTenantEntitlements(tenantId);
    return {
      ...entitlements,
      message: `Plan “${plan.slug}” assigned. ${entitlements.enabledFeatures.length} features active (overrides preserved).`,
    };
  }

  async ensureDefaultSubscription(tenantId: number, planSlug = DEFAULT_PLAN_SLUG) {
    const existing = await this.subscriptions.findOne({ where: { tenantId } });
    if (existing) return this.getTenantEntitlements(tenantId);
    return this.assignPlan(tenantId, planSlug);
  }

  async listPlans(opts?: { includeInactive?: boolean }) {
    const plans = await this.plans.find({
      relations: { planFeatures: { feature: true } },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return plans
      .filter((p) => opts?.includeInactive || p.isActive)
      .map((p) => this.serializePlan(p));
  }

  async getPlan(id: number) {
    const plan = await this.plans.findOne({
      where: { id },
      relations: { planFeatures: { feature: true } },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return this.serializePlan(plan);
  }

  async createPlan(input: {
    slug: string;
    name: string;
    description?: string | null;
    priceMonthlyCents?: number;
    currency?: string;
    featureKeys?: string[];
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const slug = input.slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException(
        'Plan slug must be lowercase letters, numbers, and hyphens',
      );
    }
    if (await this.plans.findOne({ where: { slug } })) {
      throw new BadRequestException(`Plan slug "${slug}" already exists`);
    }
    const featureKeys = [...new Set(input.featureKeys ?? [])];
    await this.assertKnownFeatureKeys(featureKeys);

    const maxSort = await this.plans
      .createQueryBuilder('p')
      .select('MAX(p.sortOrder)', 'max')
      .getRawOne<{ max: string | null }>();

    const plan = await this.plans.save(
      this.plans.create({
        slug,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        priceMonthlyCents: input.priceMonthlyCents ?? 0,
        currency: (input.currency ?? 'USD').toUpperCase(),
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? (Number(maxSort?.max ?? 0) + 1),
      }),
    );
    await this.replacePlanFeatures(plan.id, featureKeys);
    this.invalidateAll();
    return {
      ...(await this.getPlan(plan.id)),
      message: `Plan “${plan.name}” created with ${featureKeys.length} features.`,
    };
  }

  async updatePlan(
    id: number,
    input: {
      name?: string;
      description?: string | null;
      priceMonthlyCents?: number;
      currency?: string;
      featureKeys?: string[];
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');

    if (input.name !== undefined) plan.name = input.name.trim();
    if (input.description !== undefined) {
      plan.description = input.description?.trim() || null;
    }
    if (input.priceMonthlyCents !== undefined) {
      plan.priceMonthlyCents = input.priceMonthlyCents;
    }
    if (input.currency !== undefined) {
      plan.currency = input.currency.toUpperCase();
    }
    if (input.sortOrder !== undefined) plan.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) plan.isActive = input.isActive;
    await this.plans.save(plan);

    if (input.featureKeys !== undefined) {
      const featureKeys = [...new Set(input.featureKeys)];
      await this.assertKnownFeatureKeys(featureKeys);
      await this.replacePlanFeatures(plan.id, featureKeys);
    }

    this.invalidateAll();
    return {
      ...(await this.getPlan(plan.id)),
      message: `Plan “${plan.name}” updated.`,
    };
  }

  async deletePlan(id: number) {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');

    const subCount = await this.subscriptions.count({
      where: { planId: id },
    });
    if (subCount > 0) {
      plan.isActive = false;
      await this.plans.save(plan);
      this.invalidateAll();
      return {
        status: 'deactivated' as const,
        id: plan.id,
        message: `Plan “${plan.name}” has ${subCount} subscription(s), so it was deactivated instead of deleted.`,
      };
    }

    await this.planFeatures.delete({ planId: id });
    await this.plans.remove(plan);
    this.invalidateAll();
    return {
      status: 'deleted' as const,
      id,
      message: `Plan “${plan.name}” deleted.`,
    };
  }

  async createModule(input: {
    key: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
  }) {
    const key = input.key.trim().toLowerCase();
    if (!/^[a-z][a-z0-9._-]*$/.test(key)) {
      throw new BadRequestException(
        'Module key must start with a letter and use lowercase letters, numbers, dots, underscores, or hyphens',
      );
    }
    if (await this.modules.findOne({ where: { key } })) {
      throw new BadRequestException(`Module key "${key}" already exists`);
    }
    const maxSort = await this.modules
      .createQueryBuilder('m')
      .select('MAX(m.sortOrder)', 'max')
      .getRawOne<{ max: string | null }>();
    const row = await this.modules.save(
      this.modules.create({
        key,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? Number(maxSort?.max ?? 0) + 1,
        isActive: true,
      }),
    );
    return {
      ...row,
      features: [],
      message: `Module “${row.name}” created.`,
    };
  }

  async updateModule(
    id: number,
    input: {
      name?: string;
      description?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const row = await this.modules.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Module not found');
    if (input.name !== undefined) row.name = input.name.trim();
    if (input.description !== undefined) {
      row.description = input.description?.trim() || null;
    }
    if (input.sortOrder !== undefined) row.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) row.isActive = input.isActive;
    await this.modules.save(row);
    return { ...row, message: `Module “${row.name}” updated.` };
  }

  async createFeature(input: {
    moduleId: number;
    key: string;
    name: string;
    description?: string | null;
    dependsOnFeatureKey?: string | null;
    sortOrder?: number;
  }) {
    const module = await this.modules.findOne({ where: { id: input.moduleId } });
    if (!module) throw new NotFoundException('Module not found');

    const key = input.key.trim().toLowerCase();
    if (!/^[a-z][a-z0-9._-]*$/.test(key)) {
      throw new BadRequestException(
        'Feature key must start with a letter and use lowercase letters, numbers, dots, underscores, or hyphens',
      );
    }
    if (await this.features.findOne({ where: { key } })) {
      throw new BadRequestException(`Feature key "${key}" already exists`);
    }
    if (input.dependsOnFeatureKey) {
      const dep = await this.features.findOne({
        where: { key: input.dependsOnFeatureKey },
      });
      if (!dep) {
        throw new BadRequestException(
          `Dependency feature "${input.dependsOnFeatureKey}" not found`,
        );
      }
    }

    const maxSort = await this.features
      .createQueryBuilder('f')
      .select('MAX(f.sortOrder)', 'max')
      .where('f.moduleId = :moduleId', { moduleId: module.id })
      .getRawOne<{ max: string | null }>();

    const row = await this.features.save(
      this.features.create({
        moduleId: module.id,
        key,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        dependsOnFeatureKey: input.dependsOnFeatureKey || null,
        sortOrder: input.sortOrder ?? Number(maxSort?.max ?? 0) + 1,
        isActive: true,
      }),
    );
    return { ...row, message: `Feature “${row.name}” added to ${module.name}.` };
  }

  async updateFeature(
    id: number,
    input: {
      name?: string;
      description?: string | null;
      dependsOnFeatureKey?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const row = await this.features.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Feature not found');
    if (input.name !== undefined) row.name = input.name.trim();
    if (input.description !== undefined) {
      row.description = input.description?.trim() || null;
    }
    if (input.dependsOnFeatureKey !== undefined) {
      if (input.dependsOnFeatureKey) {
        if (input.dependsOnFeatureKey === row.key) {
          throw new BadRequestException('Feature cannot depend on itself');
        }
        const dep = await this.features.findOne({
          where: { key: input.dependsOnFeatureKey },
        });
        if (!dep) {
          throw new BadRequestException(
            `Dependency feature "${input.dependsOnFeatureKey}" not found`,
          );
        }
      }
      row.dependsOnFeatureKey = input.dependsOnFeatureKey || null;
    }
    if (input.sortOrder !== undefined) row.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) row.isActive = input.isActive;
    await this.features.save(row);
    this.invalidateAll();
    return { ...row, message: `Feature “${row.name}” updated.` };
  }

  private serializePlan(p: Plan) {
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      priceMonthlyCents: p.priceMonthlyCents,
      currency: p.currency,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
      featureKeys: (p.planFeatures ?? [])
        .map((pf) => pf.feature?.key)
        .filter((k): k is string => !!k),
    };
  }

  private async assertKnownFeatureKeys(keys: string[]) {
    if (!keys.length) return;
    const rows = await this.features.find({ where: { key: In(keys) } });
    const have = new Set(rows.map((r) => r.key));
    const missing = keys.filter((k) => !have.has(k));
    if (missing.length) {
      throw new BadRequestException(
        `Unknown feature key(s): ${missing.join(', ')}`,
      );
    }
  }

  private async replacePlanFeatures(planId: number, featureKeys: string[]) {
    await this.planFeatures.delete({ planId });
    for (const key of featureKeys) {
      const feature = await this.features.findOne({ where: { key } });
      if (!feature) continue;
      await this.planFeatures.save(
        this.planFeatures.create({ planId, featureId: feature.id }),
      );
    }
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
      catalogModules: await this.modules.count({ where: { isActive: true } }),
      catalogFeatures: await this.features.count({ where: { isActive: true } }),
    };
  }

  private applyDependencies(
    enabled: string[],
    deps?: Array<{ key: string; dependsOn?: string }>,
  ) {
    const set = new Set(enabled);
    const dep = new Map<string, string | undefined>();
    const source =
      deps ??
      PLATFORM_CATALOG.flatMap((m) =>
        m.features.map((f) => ({ key: f.key, dependsOn: f.dependsOn })),
      );
    for (const f of source) dep.set(f.key, f.dependsOn);
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

  private async assertDependencyClosure(keys: string[]) {
    const set = new Set(keys);
    const rows = await this.features.find({ where: { isActive: true } });
    for (const f of rows) {
      if (set.has(f.key) && f.dependsOnFeatureKey && !set.has(f.dependsOnFeatureKey)) {
        throw new BadRequestException(
          `Cannot enable "${f.name}" without its dependency. Turn on ${f.dependsOnFeatureKey} first (or leave ${f.key} off).`,
        );
      }
    }
  }

  /** Used by tests and internal checks. */
  async findFeaturesByKeys(keys: string[]) {
    if (!keys.length) return [];
    return this.features.find({ where: { key: In(keys) } });
  }
}
