import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum JobStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  CLOSED = 'closed',
}

@Entity({ name: 'jobs' })
export class Job {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId!: number | null;

  @Column({ type: 'varchar', default: JobStatus.DRAFT })
  status!: JobStatus;

  @Column({ name: 'opened_at', type: 'timestamptz', nullable: true })
  openedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
