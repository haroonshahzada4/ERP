import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { PlatformFeature } from './platform-feature.entity';

@Entity({ name: 'tenant_feature_entitlements' })
@Unique(['tenantId', 'featureId'])
export class TenantFeatureEntitlement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'tenant_id', type: 'int' })
  tenantId!: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'feature_id', type: 'int' })
  featureId!: number;

  @ManyToOne(() => PlatformFeature, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feature_id' })
  feature!: PlatformFeature;

  @Column({ default: true })
  enabled!: boolean;

  /** plan | override */
  @Column({ type: 'varchar', default: 'plan' })
  source!: 'plan' | 'override';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
