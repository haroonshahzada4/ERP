import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { Shift } from './shift.entity';

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'absent'
  | 'on_leave'
  | 'holiday'
  | 'incomplete';

@Entity({ name: 'attendances' })
@Unique(['employeeId', 'workDate'])
export class Attendance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId!: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'work_date', type: 'date' })
  workDate!: string;

  @Column({ name: 'shift_id', type: 'int', nullable: true })
  shiftId!: number | null;

  @ManyToOne(() => Shift, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shift_id' })
  shift!: Shift | null;

  @Column({ type: 'varchar', default: 'incomplete' })
  status!: AttendanceStatus;

  @Column({ name: 'check_in_at', type: 'timestamptz', nullable: true })
  checkInAt!: Date | null;

  @Column({ name: 'check_out_at', type: 'timestamptz', nullable: true })
  checkOutAt!: Date | null;

  @Column({ name: 'late_minutes', type: 'int', default: 0 })
  lateMinutes!: number;

  @Column({ name: 'worked_minutes', type: 'int', default: 0 })
  workedMinutes!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
