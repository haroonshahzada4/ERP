import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DeductionKind = 'fixed' | 'percent_base';

@Entity({ name: 'payroll_deductions' })
export class PayrollDeduction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId!: number;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: 'fixed' })
  kind!: DeductionKind;

  @Column({ name: 'amount_value', type: 'int' })
  amountValue!: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  /** When true, deducted before tax; otherwise after tax. */
  @Column({ name: 'is_pre_tax', type: 'boolean', default: true })
  isPreTax!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
