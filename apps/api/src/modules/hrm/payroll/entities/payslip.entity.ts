import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'payslips' })
@Unique(['payrollRunId', 'employeeId'])
export class Payslip {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'payroll_run_id', type: 'int' })
  payrollRunId!: number;

  @Column({ name: 'payroll_item_id', type: 'int' })
  payrollItemId!: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId!: number;

  /** Immutable snapshot JSON of the payslip lines. */
  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
