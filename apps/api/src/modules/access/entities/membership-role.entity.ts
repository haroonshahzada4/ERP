import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Role } from './role.entity';

@Entity({ name: 'membership_roles' })
@Unique(['membershipId', 'roleId'])
export class MembershipRole {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Master DB tenant_memberships.id (scalar integer — no cross-DB FK). */
  @Column({ name: 'membership_id', type: 'int' })
  membershipId!: number;

  /** Master DB users.id */
  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  @Column({ name: 'role_id', type: 'int' })
  roleId!: number;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
