import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsNumberString, IsOptional, IsString, IsInt, MinLength } from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'EMP-010' })
  @IsString()
  @MinLength(3)
  employeeCode!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  designationId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  employmentTypeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  employmentStatusId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  reportingToId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfJoining?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  basicSalary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cnic?: string;
}
