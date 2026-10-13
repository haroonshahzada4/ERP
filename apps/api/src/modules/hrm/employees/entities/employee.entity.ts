import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from '../../organization/entities/branch.entity';
import { Department } from '../../organization/entities/department.entity';
import { Designation } from '../../organization/entities/designation.entity';
import { EmploymentStatus } from '../../organization/entities/employment-status.entity';
import { EmploymentType } from '../../organization/entities/employment-type.entity';
import { EmployeeDocument } from './employee-document.entity';
import { EmploymentHistory } from './employment-history.entity';

@Entity({ name: 'employees' })
export class Employee {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_code', unique: true })
  employeeCode!: string;

  @Column({ name: 'first_name' })
  firstName!: string;

  @Column({ name: 'last_name' })
  lastName!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  /** Optional link to master users.id (scalar integer). */
  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId!: number | null;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId!: number | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch!: Branch | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId!: number | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: Department | null;

  @Column({ name: 'designation_id', type: 'int', nullable: true })
  designationId!: number | null;

  @ManyToOne(() => Designation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'designation_id' })
  designation!: Designation | null;

  @Column({ name: 'employment_type_id', type: 'int', nullable: true })
  employmentTypeId!: number | null;

  @ManyToOne(() => EmploymentType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employment_type_id' })
  employmentType!: EmploymentType | null;

  @Column({ name: 'employment_status_id', type: 'int', nullable: true })
  employmentStatusId!: number | null;

  @ManyToOne(() => EmploymentStatus, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employment_status_id' })
  employmentStatus!: EmploymentStatus | null;

  @Column({ name: 'reporting_to_id', type: 'int', nullable: true })
  reportingToId!: number | null;

  @ManyToOne(() => Employee, (employee) => employee.directReports, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'reporting_to_id' })
  reportingTo!: Employee | null;

  @OneToMany(() => Employee, (employee) => employee.reportingTo)
  directReports!: Employee[];

  @Column({ name: 'date_of_joining', type: 'date', nullable: true })
  dateOfJoining!: string | null;

  /** Sensitive — only expose with employee.write / payroll.view */
  @Column({
    name: 'basic_salary',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  basicSalary!: string | null;

  @Column({ type: 'varchar', nullable: true })
  cnic!: string | null;

  @OneToMany(() => EmployeeDocument, (doc) => doc.employee)
  documents!: EmployeeDocument[];

  @OneToMany(() => EmploymentHistory, (history) => history.employee)
  history!: EmploymentHistory[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
