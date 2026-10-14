import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'reports.export' })
  @IsString()
  @Matches(/^[a-z0-9]+(\.[a-z0-9_-]+)+$/)
  key!: string;

  @ApiProperty({ example: 'Export reports' })
  @IsString()
  @MinLength(2)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdatePermissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'team_lead' })
  @IsString()
  @Matches(/^[a-z0-9_]+$/)
  key!: string;

  @ApiProperty({ example: 'Team Lead' })
  @IsString()
  @MinLength(2)
  name!: string;
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}

export class ToggleRolePermissionDto {
  @ApiProperty({ description: 'Grant when true, revoke when false' })
  @IsBoolean()
  granted!: boolean;
}

/** Replace all grants for a role in one save (Roles matrix). */
export class SetRolePermissionsDto {
  @ApiProperty({
    type: [String],
    description: 'Full set of permission keys to grant on this role',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys!: string[];
}

export class AssignRoleDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  roleKey!: string;
}
