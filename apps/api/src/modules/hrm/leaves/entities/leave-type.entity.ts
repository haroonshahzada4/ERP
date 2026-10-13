import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'leave_types' })
export class LeaveType {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ unique: true })
  code!: string;

  @Column({ name: 'is_paid', default: true })
  isPaid!: boolean;

  @Column({ name: 'allow_half_day', default: true })
  allowHalfDay!: boolean;

  @Column({
    name: 'max_days_per_year',
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
  })
  maxDaysPerYear!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
