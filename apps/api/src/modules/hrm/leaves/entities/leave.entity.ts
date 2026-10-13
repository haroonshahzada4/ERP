import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveType } from './leave-type.entity';

export type LeaveStatus =
  | 'pending_manager'
  | 'pending_hr'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type LeaveStepStatus = 'pending' | 'approved' | 'rejected';

/** Single leave row: fiscal session window + request + manager/HR decisions. */
@Entity({ name: 'leaves' })
export class Leave {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId!: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'leave_type_id', type: 'int' })
  leaveTypeId!: number;

  @ManyToOne(() => LeaveType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'leave_type_id' })
  leaveType!: LeaveType;

  @Column({ name: 'session_name' })
  sessionName!: string;

  @Column({ name: 'session_starts_on', type: 'date' })
  sessionStartsOn!: string;

  @Column({ name: 'session_ends_on', type: 'date' })
  sessionEndsOn!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({ type: 'numeric', precision: 6, scale: 2 })
  days!: string;

  @Column({ name: 'is_half_day', default: false })
  isHalfDay!: boolean;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', default: 'pending_manager' })
  status!: LeaveStatus;

  @Column({ name: 'manager_status', type: 'varchar', nullable: true })
  managerStatus!: LeaveStepStatus | null;

  @Column({ name: 'manager_decided_by_user_id', type: 'int', nullable: true })
  managerDecidedByUserId!: number | null;

  @Column({ name: 'manager_decided_at', type: 'timestamptz', nullable: true })
  managerDecidedAt!: Date | null;

  @Column({ name: 'manager_note', type: 'text', nullable: true })
  managerNote!: string | null;

  @Column({ name: 'hr_status', type: 'varchar', nullable: true })
  hrStatus!: LeaveStepStatus | null;

  @Column({ name: 'hr_decided_by_user_id', type: 'int', nullable: true })
  hrDecidedByUserId!: number | null;

  @Column({ name: 'hr_decided_at', type: 'timestamptz', nullable: true })
  hrDecidedAt!: Date | null;

  @Column({ name: 'hr_note', type: 'text', nullable: true })
  hrNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
