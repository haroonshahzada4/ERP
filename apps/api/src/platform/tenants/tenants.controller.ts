import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequirePlatformAdmin } from '../../common/decorators/platform-admin.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  CreateTenantDto,
  UpdateCompanySettingsDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { TenantsService } from './tenants.service';

@ApiTags('platform/tenants')
@Controller('platform/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Public()
  @Get('current/branding')
  @ApiOperation({ summary: 'Branding for the host-resolved tenant' })
  branding() {
    return this.tenantsService.getBranding();
  }

  @Get()
  @ApiBearerAuth()
  @RequirePlatformAdmin()
  @ApiOperation({ summary: 'List all tenants (Super Admin)' })
  list() {
    return this.tenantsService.findAll();
  }

  @Get('current/status')
  @ApiBearerAuth()
  @RequirePermissions('tenant.settings')
  @ApiOperation({ summary: 'Active tenant provisioning + company status' })
  currentStatus() {
    return this.tenantsService.getCurrentTenantStatus();
  }

  @Get('current/company')
  @ApiBearerAuth()
  @RequirePermissions('tenant.settings')
  @ApiOperation({ summary: 'Get company branding/settings for active tenant' })
  getCompany() {
    return this.tenantsService.getCompanySettings();
  }

  @Patch('current/company')
  @ApiBearerAuth()
  @RequirePermissions('tenant.settings')
  @ApiOperation({ summary: 'Update company branding/settings' })
  updateCompany(@Body() dto: UpdateCompanySettingsDto) {
    return this.tenantsService.updateCompanySettings(dto);
  }

  /** Kept for older FE calls — same as current/status */
  @Get('demo/status')
  @ApiBearerAuth()
  @RequirePermissions('tenant.settings')
  demoStatus() {
    return this.tenantsService.getDemoTenantStatus();
  }

  @Get(':id')
  @ApiBearerAuth()
  @RequirePlatformAdmin()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @RequirePlatformAdmin()
  @ApiOperation({ summary: 'Provision a new tenant' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @RequirePlatformAdmin()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @RequirePlatformAdmin()
  @ApiOperation({ summary: 'Suspend a tenant (soft delete)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.remove(id);
  }

  @Post(':id/suspend')
  @ApiBearerAuth()
  @RequirePlatformAdmin()
  @ApiOperation({ summary: 'Suspend tenant (blocks host resolution)' })
  suspend(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.suspend(id);
  }

  @Post(':id/activate')
  @ApiBearerAuth()
  @RequirePlatformAdmin()
  @ApiOperation({ summary: 'Activate a provisioned tenant' })
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.activate(id);
  }

  @Post(':id/retry')
  @ApiBearerAuth()
  @RequirePlatformAdmin()
  @ApiOperation({ summary: 'Retry failed provisioning' })
  retry(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.retryProvision(id);
  }

  @Get(':id/provisioning')
  @ApiBearerAuth()
  @RequirePlatformAdmin()
  @ApiOperation({ summary: 'Provisioning status + last error' })
  provisioning(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.getProvisioningStatus(id);
  }
}
