import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ApplicationStatus {
  APPLIED = 'applied',
  SCREENING = 'screening',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  HIRED = 'hired',
  REJECTED = 'rejected',
}

@Entity({ name: 'job_applications' })
export class JobApplication {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'job_id', type: 'int' })
  jobId!: number;

  @Column({ name: 'candidate_name' })
  candidateName!: string;

  @Column({ name: 'candidate_email' })
  candidateEmail!: string;

  @Column({ type: 'varchar', default: ApplicationStatus.APPLIED })
  status!: ApplicationStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
