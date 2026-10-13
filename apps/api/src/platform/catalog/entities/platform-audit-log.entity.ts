import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'platform_audit_logs' })
export class PlatformAuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'actor_user_id', type: 'int', nullable: true })
  actorUserId!: number | null;

  @Column({ name: 'actor_email', type: 'varchar', nullable: true })
  actorEmail!: string | null;

  @Column()
  action!: string;

  @Column({ name: 'resource_type' })
  resourceType!: string;

  @Column({ name: 'resource_id', type: 'varchar', nullable: true })
  resourceId!: number | null;

  @Column({ name: 'tenant_id', type: 'int', nullable: true })
  tenantId!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  ip!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
