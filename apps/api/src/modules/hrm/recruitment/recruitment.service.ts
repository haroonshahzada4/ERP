import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantConnectionManager } from '../../../infrastructure/database/tenant-connection.manager';
import { TenantDatabase } from '../../../platform/tenants/entities/tenant-database.entity';
import { resolveTenantDs } from '../common/tenant-ds';
import {
  ApplicationStatus,
  JobApplication,
} from './entities/job-application.entity';
import { Job, JobStatus } from './entities/job.entity';

@Injectable()
export class RecruitmentService {
  constructor(
    @InjectRepository(TenantDatabase)
    private readonly tenantDatabases: Repository<TenantDatabase>,
    private readonly tenantConnections: TenantConnectionManager,
  ) {}

  private ds() {
    return resolveTenantDs(this.tenantDatabases, this.tenantConnections);
  }

  async listJobs() {
    const ds = await this.ds();
    return ds.getRepository(Job).find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  async createJob(input: {
    title: string;
    description?: string;
    departmentId?: number | null;
    status?: JobStatus;
  }) {
    const ds = await this.ds();
    const repo = ds.getRepository(Job);
    const status = input.status ?? JobStatus.DRAFT;
    return repo.save(
      repo.create({
        title: input.title,
        description: input.description ?? null,
        departmentId: input.departmentId ?? null,
        status,
        openedAt: status === JobStatus.OPEN ? new Date() : null,
      }),
    );
  }

  async updateJob(
    id: number,
    input: Partial<{
      title: string;
      description: string | null;
      departmentId: number | null;
      status: JobStatus;
    }>,
  ) {
    const ds = await this.ds();
    const repo = ds.getRepository(Job);
    const job = await repo.findOne({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    if (input.title !== undefined) job.title = input.title;
    if (input.description !== undefined) job.description = input.description;
    if (input.departmentId !== undefined) job.departmentId = input.departmentId;
    if (input.status !== undefined) {
      job.status = input.status;
      if (input.status === JobStatus.OPEN && !job.openedAt) {
        job.openedAt = new Date();
      }
    }
    return repo.save(job);
  }

  async listApplications(jobId?: number) {
    const ds = await this.ds();
    return ds.getRepository(JobApplication).find({
      where: jobId ? { jobId } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async createApplication(input: {
    jobId: number;
    candidateName: string;
    candidateEmail: string;
    notes?: string;
  }) {
    const ds = await this.ds();
    const job = await ds.getRepository(Job).findOne({ where: { id: input.jobId } });
    if (!job) throw new NotFoundException('Job not found');
    const repo = ds.getRepository(JobApplication);
    return repo.save(
      repo.create({
        jobId: input.jobId,
        candidateName: input.candidateName,
        candidateEmail: input.candidateEmail.toLowerCase(),
        notes: input.notes ?? null,
        status: ApplicationStatus.APPLIED,
      }),
    );
  }

  async updateApplicationStatus(id: number, status: ApplicationStatus) {
    const ds = await this.ds();
    const repo = ds.getRepository(JobApplication);
    const row = await repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Application not found');
    row.status = status;
    return repo.save(row);
  }
}
