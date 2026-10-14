import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PayrollRunStatus {
  DRAFT = 'draft',
  PENDING_HR = 'pending_hr',
  PENDING_CEO = 'pending_ceo',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity({ name: 'payroll_runs' })
export class PayrollRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ type: 'varchar', default: PayrollRunStatus.DRAFT })
  status!: PayrollRunStatus;

  @Column({ name: 'total_cents', type: 'int', default: 0 })
  totalCents!: number;

  @Column({ name: 'created_by_user_id', type: 'int', nullable: true })
  createdByUserId!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /** Bump when calculator formula changes — stored on every generate. */
  @Column({ name: 'calculation_version', type: 'varchar', default: '1.0.0' })
  calculationVersion!: string;

  @Column({ name: 'attendance_snapshot_at', type: 'timestamptz', nullable: true })
  attendanceSnapshotAt!: Date | null;

  /** Set once when CEO approves — run becomes immutable. */
  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
