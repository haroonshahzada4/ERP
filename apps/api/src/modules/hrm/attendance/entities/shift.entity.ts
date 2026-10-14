import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'shifts' })
export class Shift {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ unique: true })
  code!: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ name: 'grace_minutes', type: 'int', default: 15 })
  graceMinutes!: number;

  /** Minutes before shift end that still count as on-time departure. */
  @Column({ name: 'early_grace_minutes', type: 'int', default: 0 })
  earlyGraceMinutes!: number;

  /** Minutes after scheduled end before overtime starts counting. */
  @Column({ name: 'ot_after_minutes', type: 'int', default: 0 })
  otAfterMinutes!: number;

  @Column({ name: 'is_overnight', default: false })
  isOvernight!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
