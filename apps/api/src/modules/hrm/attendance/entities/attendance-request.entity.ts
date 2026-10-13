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
import { Attendance } from './attendance.entity';

@Entity({ name: 'attendance_requests' })
export class AttendanceRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'attendance_id', type: 'int', nullable: true })
  attendanceId!: number | null;

  @ManyToOne(() => Attendance, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'attendance_id' })
  attendance!: Attendance | null;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId!: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'work_date', type: 'date' })
  workDate!: string;

  @Column({ name: 'requested_check_in_at', type: 'timestamptz', nullable: true })
  requestedCheckInAt!: Date | null;

  @Column({
    name: 'requested_check_out_at',
    type: 'timestamptz',
    nullable: true,
  })
  requestedCheckOutAt!: Date | null;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', default: 'pending' })
  status!: 'pending' | 'approved' | 'rejected';

  @Column({ name: 'decided_by_user_id', type: 'int', nullable: true })
  decidedByUserId!: number | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
