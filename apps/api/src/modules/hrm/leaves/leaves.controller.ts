import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { RequireFeatures } from '../../../common/decorators/features.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LeavesService } from './leaves.service';

class CreateLeaveTypeDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) code!: string;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsBoolean() allowHalfDay?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxDaysPerYear?: number;
}

class ApplyLeaveDto {
  @Type(() => Number)
  @IsInt()
  leaveTypeId!: number;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  isHalfDay?: boolean;

  @IsString()
  @MinLength(3)
  reason!: string;
}

class DecideDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() note?: string;
}

@ApiTags('hrm/leaves')
@ApiBearerAuth()
@RequireFeatures('hrm.leave')
@Controller('hrm/leaves')
export class LeavesController {
  constructor(private readonly leaves: LeavesService) {}

  @Get('types')
  @RequirePermissions('leave.read')
  types() {
    return this.leaves.listTypes();
  }

  @Post('types')
  @RequirePermissions('leave.approve')
  createType(@Body() dto: CreateLeaveTypeDto) {
    return this.leaves.createType(dto);
  }

  @Get('sessions')
  @RequirePermissions('leave.read')
  @ApiOperation({ summary: 'Current Jul–Jun leave year (computed, no table)' })
  sessions() {
    return this.leaves.listSessions();
  }

  @Get('me/balances')
  @RequirePermissions('leave.read')
  @ApiOperation({ summary: 'My leave balances for current leave year' })
  myBalances(@CurrentUser() user: AuthUser) {
    return this.leaves.myBalances(user);
  }

  @Post('me/requests')
  @RequirePermissions('leave.read')
  apply(@CurrentUser() user: AuthUser, @Body() dto: ApplyLeaveDto) {
    return this.leaves.apply(user, dto);
  }

  @Get('requests')
  @RequirePermissions('leave.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    return this.leaves.listRequests(user, status);
  }

  @Get('requests/:id')
  @RequirePermissions('leave.read')
  get(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaves.getRequest(id, user);
  }

  @Patch('requests/:id')
  @RequirePermissions('leave.read')
  @ApiOperation({ summary: 'Edit own pending leave request' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: ApplyLeaveDto,
  ) {
    return this.leaves.updateRequest(id, user, dto);
  }

  @Delete('requests/:id')
  @RequirePermissions('leave.read')
  @ApiOperation({ summary: 'Cancel/delete own pending leave request' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaves.cancelRequest(id, user);
  }

  @Post('requests/:id/decide')
  @RequirePermissions('leave.read')
  @ApiOperation({
    summary: 'Manager or HR decision (step depends on request status)',
  })
  decide(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: DecideDto,
  ) {
    return this.leaves.decide(id, user, dto);
  }
}
