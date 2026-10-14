import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Response } from 'express';
import {
  AuthUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { RequireFeatures } from '../../../common/decorators/features.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { AttendanceJobsService } from './attendance-jobs.service';
import { AttendanceService } from './attendance.service';
import { AttendanceStatus } from './entities/attendance.entity';

class CreateShiftDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) code!: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @IsInt() @Min(0) graceMinutes?: number;
  @IsOptional() @IsInt() @Min(0) earlyGraceMinutes?: number;
  @IsOptional() @IsInt() @Min(0) otAfterMinutes?: number;
  @IsOptional() @IsBoolean() isOvernight?: boolean;
}

class CreateHolidayDto {
  @IsString() holidayDate!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsBoolean() isOptional?: boolean;
}

class AssignShiftDto {
  @IsInt() employeeId!: number;
  @IsInt() shiftId!: number;
  @IsString() effectiveFrom!: string;
  @IsOptional() @IsString() effectiveTo?: string | null;
}

class CorrectionDto {
  @IsString() workDate!: string;
  @IsOptional() @IsString() requestedCheckInAt?: string | null;
  @IsOptional() @IsString() requestedCheckOutAt?: string | null;
  @IsString() @MinLength(3) reason!: string;
}

class DecideDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() note?: string;
}

class UpdateAttendanceDto {
  @IsOptional() @IsString() checkInAt?: string | null;
  @IsOptional() @IsString() checkOutAt?: string | null;
  @IsOptional() @IsString() status?: AttendanceStatus;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsInt() lateMinutes?: number;
  @IsOptional() @IsInt() earlyDepartureMinutes?: number;
  @IsOptional() @IsInt() overtimeMinutes?: number;
  @IsOptional() @IsInt() workedMinutes?: number;
}

class ImportRowDto {
  @IsString() employeeCode!: string;
  @IsString() workDate!: string;
  @IsOptional() @IsString() checkInAt?: string | null;
  @IsOptional() @IsString() checkOutAt?: string | null;
  @IsOptional() @IsString() status?: AttendanceStatus;
  @IsOptional() @IsString() notes?: string | null;
}

class ImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
}

@ApiTags('hrm/attendance')
@ApiBearerAuth()
@RequireFeatures('hrm.attendance')
@Controller('hrm/attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly jobs: AttendanceJobsService,
  ) {}

  @Get('me/today')
  @RequirePermissions('attendance.read')
  @ApiOperation({ summary: 'My attendance status for today (no GPS)' })
  myToday(@CurrentUser() user: AuthUser) {
    return this.attendance.myToday(user);
  }

  @Post('me/check-in')
  @RequirePermissions('attendance.create')
  @ApiOperation({ summary: 'Check in for today (no GPS/location)' })
  checkIn(@CurrentUser() user: AuthUser) {
    return this.attendance.checkIn(user);
  }

  @Post('me/check-out')
  @RequirePermissions('attendance.create')
  checkOut(@CurrentUser() user: AuthUser) {
    return this.attendance.checkOut(user);
  }

  @Post('me/corrections')
  @RequirePermissions('attendance.create')
  requestCorrection(@CurrentUser() user: AuthUser, @Body() dto: CorrectionDto) {
    return this.attendance.requestCorrection(user, dto);
  }

  @Get('export')
  @RequirePermissions('attendance.export')
  async export(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'xlsx' | 'csv' | 'pdf' = 'xlsx',
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.attendance.exportFile(user, {
      from,
      to,
      format: format ?? 'xlsx',
    });
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });
    return new StreamableFile(file.buffer);
  }

  @Get('reports/daily')
  @RequirePermissions('attendance.report.read')
  reportDaily(@CurrentUser() user: AuthUser, @Query('date') date: string) {
    return this.attendance.reportDaily(user, date || isoToday());
  }

  @Get('reports/weekly')
  @RequirePermissions('attendance.report.read')
  reportWeekly(@CurrentUser() user: AuthUser, @Query('from') from: string) {
    return this.attendance.reportWeekly(user, from || isoToday());
  }

  @Get('reports/monthly')
  @RequirePermissions('attendance.report.read')
  reportMonthly(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: number,
    @Query('month') month?: number,
  ) {
    const now = new Date();
    return this.attendance.reportMonthly(
      user,
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
    );
  }

  @Get('reports/summary')
  @RequirePermissions('attendance.report.read')
  reportSummary(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.attendance.reportSummary(user, from, to);
  }

  @Get('requests')
  @RequirePermissions('attendance.read')
  listRequests(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    return this.attendance.listRequests(user, status);
  }

  @Post('requests/:id/decide')
  @RequirePermissions('attendance.update')
  decide(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: DecideDto,
  ) {
    return this.attendance.decideRequest(id, user, dto);
  }

  @Get('shifts')
  @RequirePermissions('attendance.read')
  shifts() {
    return this.attendance.listShifts();
  }

  @Post('shifts')
  @RequirePermissions('attendance.update')
  createShift(@Body() dto: CreateShiftDto) {
    return this.attendance.createShift(dto);
  }

  @Post('shifts/assign')
  @RequirePermissions('attendance.update')
  assignShift(@Body() dto: AssignShiftDto) {
    return this.attendance.assignShift(dto);
  }

  @Get('holidays')
  @RequirePermissions('attendance.read')
  holidays() {
    return this.attendance.listHolidays();
  }

  @Post('holidays')
  @RequirePermissions('attendance.update')
  createHoliday(@Body() dto: CreateHolidayDto) {
    return this.attendance.createHoliday(dto);
  }

  @Post('import')
  @RequirePermissions('attendance.import')
  importRows(@CurrentUser() user: AuthUser, @Body() dto: ImportDto) {
    return this.attendance.importRows(user, dto.rows);
  }

  @Post('jobs/generate-daily')
  @RequirePermissions('attendance.update')
  @ApiOperation({ summary: 'Manually run AddAttendanceRecords for all tenants' })
  runGenerate(@Query('workDate') workDate?: string) {
    return this.jobs.runAddNow(workDate);
  }

  @Post('jobs/update-status')
  @RequirePermissions('attendance.update')
  @ApiOperation({ summary: 'Manually run UpdateAttendanceStatus for all tenants' })
  runUpdate(@Query('workDate') workDate?: string) {
    return this.jobs.runUpdateNow(workDate);
  }

  @Get()
  @RequirePermissions('attendance.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employeeId') employeeId?: number,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.attendance.list(user, {
      from,
      to,
      employeeId,
      status,
      q,
    });
  }

  @Patch(':id')
  @RequirePermissions('attendance.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.attendance.updateRecord(id, user, dto);
  }
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
