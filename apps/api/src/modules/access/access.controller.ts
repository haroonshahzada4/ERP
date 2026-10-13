import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AccessService } from './access.service';
import {
  AssignRoleDto,
  CreatePermissionDto,
  CreateRoleDto,
  ToggleRolePermissionDto,
  UpdatePermissionDto,
  UpdateRoleDto,
} from './dto/access.dto';

@ApiTags('access')
@ApiBearerAuth()
@Controller('access')
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Get('roles')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Roles / permissions matrix' })
  roles() {
    return this.accessService.listRolesMatrix();
  }

  @Post('roles')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Create role' })
  createRole(@Body() dto: CreateRoleDto) {
    return this.accessService.createRole(dto);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Update role' })
  updateRole(@Param('id') id: number, @Body() dto: UpdateRoleDto) {
    return this.accessService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Delete role' })
  deleteRole(@Param('id') id: number) {
    return this.accessService.deleteRole(id);
  }

  @Put('roles/:roleId/permissions/:permissionKey')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Grant or revoke a permission on a role' })
  setRolePermission(
    @Param('roleId') roleId: number,
    @Param('permissionKey') permissionKey: string,
    @Body() dto: ToggleRolePermissionDto,
  ) {
    return this.accessService.setRolePermission(
      roleId,
      permissionKey,
      dto.granted,
    );
  }

  @Post('permissions')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Create permission' })
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.accessService.createPermission(dto);
  }

  @Patch('permissions/:id')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Update permission' })
  updatePermission(
    @Param('id') id: number,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.accessService.updatePermission(id, dto);
  }

  @Delete('permissions/:id')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Delete permission' })
  deletePermission(@Param('id') id: number) {
    return this.accessService.deletePermission(id);
  }

  @Get('members')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Tenant members + roles' })
  members() {
    return this.accessService.listMembers();
  }

  @Post('members/:membershipId/roles')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Assign role to membership' })
  assign(
    @Param('membershipId') membershipId: number,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accessService.assignRole(
      membershipId,
      dto.roleKey,
      user.userId,
    );
  }

  @Delete('members/:membershipId/roles/:roleKey')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Unassign role from membership' })
  unassign(
    @Param('membershipId') membershipId: number,
    @Param('roleKey') roleKey: string,
  ) {
    return this.accessService.unassignRole(membershipId, roleKey);
  }

  @Post('members/:membershipId/revoke')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Revoke tenant membership' })
  revoke(@Param('membershipId') membershipId: number) {
    return this.accessService.revokeMembership(membershipId);
  }
}
