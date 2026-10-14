import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantDatabase } from '../../../platform/tenants/entities/tenant-database.entity';
import { AttendanceController } from './attendance.controller';
import { AttendanceJobsService } from './attendance-jobs.service';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantDatabase])],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceJobsService],
  exports: [AttendanceService, AttendanceJobsService],
})
export class AttendanceModule {}
