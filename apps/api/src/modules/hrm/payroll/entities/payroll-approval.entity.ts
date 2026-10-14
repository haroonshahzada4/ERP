import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PayrollApprovalStep = 'hr' | 'ceo';

@Entity({ name: 'payroll_approvals' })
export class PayrollApproval {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'payroll_run_id', type: 'int' })
  payrollRunId!: number;

  @Column({ type: 'varchar', length: 10 })
  step!: PayrollApprovalStep;

  @Column({ type: 'varchar', length: 20 })
  decision!: 'approved' | 'rejected';

  @Column({ name: 'actor_user_id', type: 'int' })
  actorUserId!: number;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
