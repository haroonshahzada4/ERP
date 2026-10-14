import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantDatabase } from './tenant-database.entity';
import { TenantDomain } from './tenant-domain.entity';

export enum TenantStatus {
  PROVISIONING = 'provisioning',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  FAILED = 'failed',
}

@Entity({ name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  slug!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', default: TenantStatus.PROVISIONING })
  status!: TenantStatus;

  @Column({ type: 'varchar', default: '0.1.0', name: 'schema_version' })
  schemaVersion!: string;

  @Column({ name: 'logo_url', type: 'varchar', nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'brand_primary', type: 'varchar', default: '#1ecf8a' })
  brandPrimary!: string;

  @Column({ name: 'brand_secondary', type: 'varchar', default: '#149a66' })
  brandSecondary!: string;

  @Column({ name: 'theme_mode', type: 'varchar', default: 'dark' })
  themeMode!: 'dark' | 'light';

  /** Last provisioning failure message; cleared on successful activate. */
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @OneToMany(() => TenantDomain, (domain) => domain.tenant)
  domains!: TenantDomain[];

  @OneToMany(() => TenantDatabase, (database) => database.tenant)
  databases!: TenantDatabase[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
