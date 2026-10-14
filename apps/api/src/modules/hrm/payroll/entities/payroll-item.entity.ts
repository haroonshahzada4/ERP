import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'payroll_items' })
export class PayrollItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'payroll_run_id', type: 'int' })
  payrollRunId!: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId!: number;

  @Column({ name: 'base_cents', type: 'int', default: 0 })
  baseCents!: number;

  @Column({ name: 'allowance_cents', type: 'int', default: 0 })
  allowanceCents!: number;

  @Column({ name: 'deduction_cents', type: 'int', default: 0 })
  deductionCents!: number;

  @Column({ name: 'tax_cents', type: 'int', default: 0 })
  taxCents!: number;

  @Column({ name: 'net_cents', type: 'int', default: 0 })
  netCents!: number;

  @Column({ name: 'days_present', type: 'int', default: 0 })
  daysPresent!: number;

  @Column({ name: 'days_expected', type: 'int', default: 0 })
  daysExpected!: number;

  /** Line-level breakdown for payslips / audit. */
  @Column({ type: 'jsonb', nullable: true })
  breakdown!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
