import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

export enum SupportAccessStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Entity({ name: 'support_access_requests' })
export class SupportAccessRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'tenant_id', type: 'int' })
  tenantId!: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'requester_user_id', type: 'int' })
  requesterUserId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_user_id' })
  requester!: User;

  @Column({ type: 'varchar', default: SupportAccessStatus.PENDING })
  status!: SupportAccessStatus;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'feature_keys', type: 'text', array: true, default: '{}' })
  featureKeys!: string[];

  @Column({
    name: 'permission_keys',
    type: 'text',
    array: true,
    default: '{}',
  })
  permissionKeys!: string[];

  @Column({ default: false })
  emergency!: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'decided_by_user_id', type: 'int', nullable: true })
  decidedByUserId!: number | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
