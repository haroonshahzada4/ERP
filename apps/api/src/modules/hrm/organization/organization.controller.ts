import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, MinLength } from 'class-validator';
import { RequireFeatures } from '../../../common/decorators/features.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { OrganizationService } from './organization.service';

class CreateBranchDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  code!: string;

  @IsOptional()
  @IsString()
  city?: string;
}

class CreateDepartmentDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  code!: string;

  @IsOptional()
  @IsInt()
  branchId?: number;
}

class CreateDesignationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  code!: string;
}

@ApiTags('hrm/organization')
@ApiBearerAuth()
@RequireFeatures('hrm.employees')
@Controller('hrm/organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('setup')
  @RequirePermissions('employee.read')
  @ApiOperation({ summary: 'Organization setup lists' })
  setup() {
    return this.organizationService.getSetup();
  }

  @Post('branches')
  @RequirePermissions('employee.write')
  createBranch(@Body() dto: CreateBranchDto) {
    return this.organizationService.createBranch(dto);
  }

  @Post('departments')
  @RequirePermissions('employee.write')
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.organizationService.createDepartment(dto);
  }

  @Post('designations')
  @RequirePermissions('employee.write')
  createDesignation(@Body() dto: CreateDesignationDto) {
    return this.organizationService.createDesignation(dto);
  }
}
