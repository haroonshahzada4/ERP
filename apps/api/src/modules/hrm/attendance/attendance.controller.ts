import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { RequireFeatures } from '../../../common/decorators/features.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { AttendanceService } from './attendance.service';

class CreateShiftDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) code!: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @IsInt() @Min(0) graceMinutes?: number;
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

@ApiTags('hrm/attendance')
@ApiBearerAuth()
@RequireFeatures('hrm.attendance')
@Controller('hrm/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('me/today')
  @RequirePermissions('attendance.read')
  @ApiOperation({ summary: 'My attendance status for today (no location)' })
  myToday(@CurrentUser() user: AuthUser) {
    return this.attendance.myToday(user);
  }

  @Post('me/check-in')
  @RequirePermissions('attendance.read')
  @ApiOperation({ summary: 'Check in for today (no GPS/location)' })
  checkIn(@CurrentUser() user: AuthUser) {
    return this.attendance.checkIn(user);
  }

  @Post('me/check-out')
  @RequirePermissions('attendance.read')
  checkOut(@CurrentUser() user: AuthUser) {
    return this.attendance.checkOut(user);
  }

  @Post('me/corrections')
  @RequirePermissions('attendance.read')
  requestCorrection(@CurrentUser() user: AuthUser, @Body() dto: CorrectionDto) {
    return this.attendance.requestCorrection(user, dto);
  }

  @Get()
  @RequirePermissions('attendance.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employeeId') employeeId?: number,
  ) {
    return this.attendance.list(user, { from, to, employeeId });
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
  @RequirePermissions('attendance.approve')
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
  @RequirePermissions('attendance.approve')
  createShift(@Body() dto: CreateShiftDto) {
    return this.attendance.createShift(dto);
  }

  @Post('shifts/assign')
  @RequirePermissions('attendance.approve')
  assignShift(@Body() dto: AssignShiftDto) {
    return this.attendance.assignShift(dto);
  }

  @Get('holidays')
  @RequirePermissions('attendance.read')
  holidays() {
    return this.attendance.listHolidays();
  }

  @Post('holidays')
  @RequirePermissions('attendance.approve')
  createHoliday(@Body() dto: CreateHolidayDto) {
    return this.attendance.createHoliday(dto);
  }
}
