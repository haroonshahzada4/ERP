import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity({ name: 'tenant_domains' })
@Unique(['host'])
export class TenantDomain {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'tenant_id', type: 'int' })
  tenantId!: number;

  @ManyToOne(() => Tenant, (tenant) => tenant.domains, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column()
  host!: string;

  @Column({ name: 'is_primary', default: false })
  isPrimary!: boolean;

  @Column({ name: 'is_verified', default: true })
  isVerified!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
