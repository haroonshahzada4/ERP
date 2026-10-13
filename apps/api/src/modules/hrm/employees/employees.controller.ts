import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { RequireFeatures } from '../../../common/decorators/features.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@ApiTags('hrm/employees')
@ApiBearerAuth()
@RequireFeatures('hrm.employees')
@Controller('hrm/employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('employee.read')
  @ApiOperation({ summary: 'List employees (scoped)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('departmentId') departmentId?: number,
    @Query('branchId') branchId?: number,
  ) {
    return this.employeesService.list({ q, departmentId, branchId }, user);
  }

  @Get('me')
  @RequirePermissions('employee.read')
  @ApiOperation({ summary: 'My employee profile' })
  me(@CurrentUser() user: AuthUser) {
    return this.employeesService.myProfile(user);
  }

  @Get(':id')
  @RequirePermissions('employee.read')
  @ApiOperation({ summary: 'Employee profile' })
  get(@Param('id') id: number, @CurrentUser() user: AuthUser) {
    return this.employeesService.getById(id, user);
  }

  @Post()
  @RequirePermissions('employee.write')
  @ApiOperation({ summary: 'Create employee' })
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthUser) {
    return this.employeesService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('employee.write')
  @ApiOperation({ summary: 'Update employee' })
  update(
    @Param('id') id: number,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeesService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('employee.write')
  @ApiOperation({ summary: 'Delete employee' })
  remove(@Param('id') id: number, @CurrentUser() user: AuthUser) {
    return this.employeesService.remove(id, user);
  }
}
