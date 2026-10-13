import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity({ name: 'tenant_databases' })
export class TenantDatabase {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'tenant_id', type: 'int' })
  tenantId!: number;

  @ManyToOne(() => Tenant, (tenant) => tenant.databases, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'db_name' })
  dbName!: string;

  @Column({ name: 'db_host' })
  dbHost!: string;

  @Column({ name: 'db_port', type: 'int', default: 5432 })
  dbPort!: number;

  /** Local Phase 0: plaintext for convenience. Phase 1+ should use secret refs. */
  @Column({ name: 'db_user' })
  dbUser!: string;

  @Column({ name: 'db_password' })
  dbPassword!: string;

  @Column({ name: 'schema_version', type: 'varchar', default: '0.1.0' })
  schemaVersion!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
