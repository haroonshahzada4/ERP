import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const LOGO_URL = /^(https?:\/\/|data:image\/(png|jpeg|webp|svg\+xml|gif);base64,)/;

export class CreateTenantDto {
  @ApiProperty({ example: 'horizon' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug!: string;

  @ApiProperty({ example: 'Horizon Logistics' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'horizon.localhost' })
  @IsOptional()
  @IsString()
  host?: string;

  @ApiPropertyOptional({ example: 'admin@horizon.com' })
  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @ApiPropertyOptional({ example: 'admin' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  adminPassword?: string;

  @ApiPropertyOptional({ example: '#f97316' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'brandPrimary must be a #RRGGBB hex color' })
  brandPrimary?: string;

  @ApiPropertyOptional({ example: '#ea580c' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'brandSecondary must be a #RRGGBB hex color' })
  brandSecondary?: string;

  @ApiPropertyOptional({ example: 'dark', enum: ['dark', 'light'] })
  @IsOptional()
  @IsIn(['dark', 'light'])
  themeMode?: 'dark' | 'light';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250_000)
  @Matches(LOGO_URL, { message: 'logoUrl must be http(s) or an image data URL' })
  logoUrl?: string;
}

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @ApiPropertyOptional({ enum: ['active', 'suspended', 'provisioning'] })
  @IsOptional()
  @IsIn(['active', 'suspended', 'provisioning'])
  status?: 'active' | 'suspended' | 'provisioning';
}

export class UpdateCompanySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250_000)
  @Matches(LOGO_URL, { message: 'logoUrl must be http(s) or an image data URL' })
  logoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'brandPrimary must be a #RRGGBB hex color' })
  brandPrimary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'brandSecondary must be a #RRGGBB hex color' })
  brandSecondary?: string;

  @ApiPropertyOptional({ enum: ['dark', 'light'] })
  @IsOptional()
  @IsIn(['dark', 'light'])
  themeMode?: 'dark' | 'light';
}
