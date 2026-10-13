import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Tenant-DB entity — lives only in per-tenant databases. */
@Entity({ name: 'company_settings' })
export class CompanySettings {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: 'varchar', default: 'UTC' })
  timezone!: string;

  @Column({ name: 'fiscal_year_start_month', type: 'int', default: 7 })
  fiscalYearStartMonth!: number;

  @Column({ name: 'logo_url', type: 'varchar', nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'brand_primary', type: 'varchar', default: '#1ecf8a' })
  brandPrimary!: string;

  @Column({ name: 'brand_secondary', type: 'varchar', default: '#149a66' })
  brandSecondary!: string;

  @Column({ name: 'theme_mode', type: 'varchar', default: 'dark' })
  themeMode!: 'dark' | 'light';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
