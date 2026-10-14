import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import {
  PLAN_DEFINITIONS,
  PLATFORM_CATALOG,
} from './catalog.definitions';
import { EntitlementsService } from './entitlements.service';
import { PlanFeature } from './entities/plan-feature.entity';
import { Plan } from './entities/plan.entity';
import { PlatformFeature } from './entities/platform-feature.entity';
import { PlatformModule } from './entities/platform-module.entity';

/** Seed catalog + plans once; assign subscriptions to existing tenants. */
@Injectable()
export class CatalogSeeder {
  private readonly logger = new Logger(CatalogSeeder.name);

  constructor(
    @InjectRepository(PlatformModule)
    private readonly modules: Repository<PlatformModule>,
    @InjectRepository(PlatformFeature)
    private readonly features: Repository<PlatformFeature>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(PlanFeature)
    private readonly planFeatures: Repository<PlanFeature>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Called from DatabaseBootstrapService after master migrations. */
  async seedAll() {
    await this.seedCatalog();
    await this.seedPlans();
    await this.seedTenantSubscriptions();
  }

  private async seedCatalog() {
    for (const [mi, mod] of PLATFORM_CATALOG.entries()) {
      let module = await this.modules.findOne({ where: { key: mod.key } });
      if (!module) {
        module = await this.modules.save(
          this.modules.create({
            key: mod.key,
            name: mod.name,
            description: mod.description ?? null,
            sortOrder: mi,
            isActive: true,
          }),
        );
      } else {
        module.name = mod.name;
        module.description = mod.description ?? null;
        module.sortOrder = mi;
        await this.modules.save(module);
      }

      for (const [fi, feat] of mod.features.entries()) {
        let row = await this.features.findOne({ where: { key: feat.key } });
        if (!row) {
          await this.features.save(
            this.features.create({
              moduleId: module.id,
              key: feat.key,
              name: feat.name,
              description: feat.description ?? null,
              dependsOnFeatureKey: feat.dependsOn ?? null,
              sortOrder: fi,
              isActive: true,
            }),
          );
        } else {
          row.moduleId = module.id;
          row.name = feat.name;
          row.description = feat.description ?? null;
          row.dependsOnFeatureKey = feat.dependsOn ?? null;
          row.sortOrder = fi;
          await this.features.save(row);
        }
      }
    }
    this.logger.log('Platform module/feature catalog seeded');
  }

  private async seedPlans() {
    // Only create missing default plans. Never overwrite Super Admin edits.
    for (const [i, def] of PLAN_DEFINITIONS.entries()) {
      const existing = await this.plans.findOne({ where: { slug: def.slug } });
      if (existing) continue;

      const plan = await this.plans.save(
        this.plans.create({
          slug: def.slug,
          name: def.name,
          description: def.description,
          priceMonthlyCents: def.priceMonthlyCents,
          currency: 'USD',
          isActive: true,
          sortOrder: i,
        }),
      );

      for (const key of def.featureKeys) {
        const feature = await this.features.findOne({ where: { key } });
        if (!feature) continue;
        await this.planFeatures.save(
          this.planFeatures.create({ planId: plan.id, featureId: feature.id }),
        );
      }
    }
    this.logger.log('Plans seeded (defaults only; existing plans preserved)');
  }

  private async seedTenantSubscriptions() {
    const tenants = await this.tenants.find();
    const planBySlug: Record<string, string> = {
      demo: 'enterprise',
      horizon: 'starter',
      summit: 'growth',
    };
    for (const t of tenants) {
      await this.entitlements.ensureDefaultSubscription(
        t.id,
        planBySlug[t.slug] ?? 'growth',
      );
    }
    this.logger.log(`Subscriptions ensured for ${tenants.length} tenants`);
  }
}
