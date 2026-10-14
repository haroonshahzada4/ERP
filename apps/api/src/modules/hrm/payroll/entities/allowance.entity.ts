import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AllowanceKind = 'fixed' | 'percent_base';

@Entity({ name: 'payroll_allowances' })
export class PayrollAllowance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId!: number;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: 'fixed' })
  kind!: AllowanceKind;

  /** Fixed cents OR percent * 100 (e.g. 1050 = 10.50%). */
  @Column({ name: 'amount_value', type: 'int' })
  amountValue!: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ name: 'is_taxable', type: 'boolean', default: true })
  isTaxable!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
