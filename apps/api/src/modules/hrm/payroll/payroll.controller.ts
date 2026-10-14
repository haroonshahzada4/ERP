import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { RequireFeatures } from '../../../common/decorators/features.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { PayrollService } from './payroll.service';

class CompensationDto {
  employeeId!: number;
  baseCents!: number;
  currency?: string;
  effectiveFrom!: string;
  effectiveTo?: string | null;
}

class AllowanceDto {
  employeeId!: number;
  name!: string;
  kind!: 'fixed' | 'percent_base';
  amountValue!: number;
  effectiveFrom!: string;
  effectiveTo?: string | null;
  isTaxable?: boolean;
}

class DeductionDto {
  employeeId!: number;
  name!: string;
  kind!: 'fixed' | 'percent_base';
  amountValue!: number;
  effectiveFrom!: string;
  effectiveTo?: string | null;
  isPreTax?: boolean;
}

class TaxSlabDto {
  id?: number;
  name!: string;
  fromCents!: number;
  toCents?: number | null;
  rateBps!: number;
  sortOrder?: number;
  isActive?: boolean;
}

class GenerateRunDto {
  periodStart!: string;
  periodEnd!: string;
  notes?: string;
}

class DecideDto {
  approve!: boolean;
  remarks?: string;
}

@ApiTags('hrm/payroll')
@ApiBearerAuth()
@RequireFeatures('hrm.payroll')
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('roster')
  @RequirePermissions('payroll.view')
  roster() {
    return this.payroll.salaryRoster();
  }

  @Get('compensations')
  @RequirePermissions('payroll.view')
  listCompensations(@Query('employeeId') employeeId?: string) {
    return this.payroll.listCompensations(
      employeeId ? Number(employeeId) : undefined,
    );
  }

  @Post('compensations')
  @RequirePermissions('payroll.generate')
  upsertCompensation(@Body() dto: CompensationDto) {
    return this.payroll.upsertCompensation(dto);
  }

  @Get('allowances')
  @RequirePermissions('payroll.view')
  listAllowances(@Query('employeeId') employeeId?: string) {
    return this.payroll.listAllowances(
      employeeId ? Number(employeeId) : undefined,
    );
  }

  @Post('allowances')
  @RequirePermissions('payroll.generate')
  upsertAllowance(@Body() dto: AllowanceDto) {
    return this.payroll.upsertAllowance(dto);
  }

  @Get('deductions')
  @RequirePermissions('payroll.view')
  listDeductions(@Query('employeeId') employeeId?: string) {
    return this.payroll.listDeductions(
      employeeId ? Number(employeeId) : undefined,
    );
  }

  @Post('deductions')
  @RequirePermissions('payroll.generate')
  upsertDeduction(@Body() dto: DeductionDto) {
    return this.payroll.upsertDeduction(dto);
  }

  @Get('tax-slabs')
  @RequirePermissions('payroll.view')
  listTaxSlabs() {
    return this.payroll.ensureDefaultTaxSlabs();
  }

  @Post('tax-slabs')
  @RequirePermissions('payroll.generate')
  upsertTaxSlab(@Body() dto: TaxSlabDto) {
    return this.payroll.upsertTaxSlab(dto);
  }

  @Get('runs')
  @RequirePermissions('payroll.view')
  listRuns() {
    return this.payroll.listRuns();
  }

  @Get('runs/:id')
  @RequirePermissions('payroll.view')
  getRun(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.getRun(id);
  }

  @Post('runs')
  @RequirePermissions('payroll.generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateRunDto) {
    return this.payroll.generateRun(user, dto);
  }

  @Post('runs/:id/recalculate')
  @RequirePermissions('payroll.generate')
  recalculate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.recalculateDraft(id, user);
  }

  @Post('runs/:id/submit')
  @RequirePermissions('payroll.generate')
  submit(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.submitForHr(id);
  }

  @Post('runs/:id/hr-decide')
  @RequirePermissions('payroll.approve.hr')
  hrDecide(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: DecideDto,
  ) {
    return this.payroll.decideHr(id, user, {
      approve: !!dto.approve,
      remarks: dto.remarks,
    });
  }

  @Post('runs/:id/ceo-decide')
  @RequirePermissions('payroll.approve.ceo')
  ceoDecide(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: DecideDto,
  ) {
    return this.payroll.decideCeo(id, user, {
      approve: !!dto.approve,
      remarks: dto.remarks,
    });
  }

  @Get('payslips')
  @RequirePermissions('payroll.view')
  listPayslips(@Query('employeeId') employeeId?: string) {
    return this.payroll.listPayslips(
      employeeId ? Number(employeeId) : undefined,
    );
  }

  @Get('payslips/:id')
  @RequirePermissions('payroll.view')
  getPayslip(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.getPayslip(id, user);
  }
}
