import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_tax_slabs' })
export class TaxSlab {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  /** Inclusive lower bound of annual/monthly taxable income in cents. */
  @Column({ name: 'from_cents', type: 'int' })
  fromCents!: number;

  /** Exclusive upper bound; null = unlimited. */
  @Column({ name: 'to_cents', type: 'int', nullable: true })
  toCents!: number | null;

  /** Rate in basis points (e.g. 500 = 5%). */
  @Column({ name: 'rate_bps', type: 'int' })
  rateBps!: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
