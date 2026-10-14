import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantConnectionManager } from '../../../infrastructure/database/tenant-connection.manager';
import { Tenant, TenantStatus } from '../../../platform/tenants/entities/tenant.entity';
import { TenantDatabase } from '../../../platform/tenants/entities/tenant-database.entity';
import { CompanySettings } from '../../access/entities/company-settings.entity';
import { AttendanceService } from './attendance.service';

/**
 * Multi-tenant attendance automation.
 * Schedules use Asia/Karachi by default; per-tenant timezone is read when available.
 */
@Injectable()
export class AttendanceJobsService {
  private readonly logger = new Logger(AttendanceJobsService.name);
  private runningAdd = false;
  private runningUpdate = false;

  constructor(
    @InjectDataSource()
    private readonly masterDs: DataSource,
    @InjectRepository(TenantDatabase)
    private readonly tenantDatabases: Repository<TenantDatabase>,
    private readonly tenantConnections: TenantConnectionManager,
    private readonly attendance: AttendanceService,
  ) {}

  /** Daily 00:10 Asia/Karachi — create shift-awaiting attendance rows. */
  @Cron('10 0 * * *', { timeZone: 'Asia/Karachi' })
  async addAttendanceRecordsCron() {
    await this.runForAllTenants('AddAttendanceRecords', async (ds, workDate) => {
      return this.attendance.generateDailyRecords(ds, workDate);
    });
  }

  /** Every hour at :15 and :45 — finalize statuses. */
  @Cron('15,45 * * * *', { timeZone: 'Asia/Karachi' })
  async updateAttendanceStatusCron() {
    await this.runForAllTenants('UpdateAttendanceStatus', async (ds, workDate) => {
      return this.attendance.updateStatusesForDate(ds, workDate);
    });
  }

  /** Manual trigger (admin / tests). */
  async runAddNow(workDate?: string) {
    return this.runForAllTenants('AddAttendanceRecords', async (ds, date) => {
      return this.attendance.generateDailyRecords(ds, workDate ?? date);
    });
  }

  async runUpdateNow(workDate?: string) {
    return this.runForAllTenants('UpdateAttendanceStatus', async (ds, date) => {
      return this.attendance.updateStatusesForDate(ds, workDate ?? date);
    });
  }

  private async runForAllTenants(
    jobName: string,
    fn: (ds: DataSource, workDate: string) => Promise<{ created?: number; updated?: number }>,
  ) {
    const lock =
      jobName === 'AddAttendanceRecords' ? 'runningAdd' : 'runningUpdate';
    if (this[lock]) {
      this.logger.warn(`${jobName} skipped — already running`);
      return;
    }
    this[lock] = true;
    try {
      const tenants = await this.masterDs.getRepository(Tenant).find({
        where: { status: TenantStatus.ACTIVE },
      });
      for (const tenant of tenants) {
        try {
          const dbMeta = await this.tenantDatabases.findOne({
            where: { tenantId: tenant.id },
          });
          if (!dbMeta) continue;
          const ds = await this.tenantConnections.getOrCreate(tenant.id, {
            host: dbMeta.dbHost,
            port: dbMeta.dbPort,
            username: dbMeta.dbUser,
            password: dbMeta.dbPassword,
            database: dbMeta.dbName,
          });
          const workDate = await this.todayInTenantTz(ds);
          const result = await fn(ds, workDate);
          this.logger.log(
            `${jobName} tenant=${tenant.slug} date=${workDate} ${JSON.stringify(result)}`,
          );
        } catch (err) {
          this.logger.error(
            `${jobName} failed for tenant ${tenant.slug}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this[lock] = false;
    }
  }

  private async todayInTenantTz(ds: DataSource) {
    const settings = await ds.getRepository(CompanySettings).find({
      take: 1,
      order: { createdAt: 'ASC' },
    });
    const tz = settings[0]?.timezone || 'Asia/Karachi';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }
}
