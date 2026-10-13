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
import { LeaveType } from './leave-type.entity';

@Entity({ name: 'leave_balances' })
@Unique(['employeeId', 'leaveTypeId', 'sessionStartsOn'])
export class LeaveBalance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId!: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'leave_type_id', type: 'int' })
  leaveTypeId!: number;

  @ManyToOne(() => LeaveType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_type_id' })
  leaveType!: LeaveType;

  @Column({ name: 'session_name' })
  sessionName!: string;

  @Column({ name: 'session_starts_on', type: 'date' })
  sessionStartsOn!: string;

  @Column({ name: 'session_ends_on', type: 'date' })
  sessionEndsOn!: string;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  accrued!: string;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  used!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
