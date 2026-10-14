import { CompanySettings } from '../../modules/access/entities/company-settings.entity';
import { MembershipRole } from '../../modules/access/entities/membership-role.entity';
import { Permission } from '../../modules/access/entities/permission.entity';
import { RolePermission } from '../../modules/access/entities/role-permission.entity';
import { Role } from '../../modules/access/entities/role.entity';
import { EmployeeDocument } from '../../modules/hrm/employees/entities/employee-document.entity';
import { Employee } from '../../modules/hrm/employees/entities/employee.entity';
import { EmploymentHistory } from '../../modules/hrm/employees/entities/employment-history.entity';
import { Branch } from '../../modules/hrm/organization/entities/branch.entity';
import { Department } from '../../modules/hrm/organization/entities/department.entity';
import { Designation } from '../../modules/hrm/organization/entities/designation.entity';
import { DocumentType } from '../../modules/hrm/organization/entities/document-type.entity';
import { EmploymentStatus } from '../../modules/hrm/organization/entities/employment-status.entity';
import { EmploymentType } from '../../modules/hrm/organization/entities/employment-type.entity';
import { AttendanceRequest } from '../../modules/hrm/attendance/entities/attendance-request.entity';
import { Attendance } from '../../modules/hrm/attendance/entities/attendance.entity';
import { Holiday } from '../../modules/hrm/attendance/entities/holiday.entity';
import { ShiftAssignment } from '../../modules/hrm/attendance/entities/shift-assignment.entity';
import { Shift } from '../../modules/hrm/attendance/entities/shift.entity';
import { LeaveBalance } from '../../modules/hrm/leaves/entities/leave-balance.entity';
import { Leave } from '../../modules/hrm/leaves/entities/leave.entity';
import { LeaveType } from '../../modules/hrm/leaves/entities/leave-type.entity';
import { PayrollAllowance } from '../../modules/hrm/payroll/entities/allowance.entity';
import { Compensation } from '../../modules/hrm/payroll/entities/compensation.entity';
import { PayrollDeduction } from '../../modules/hrm/payroll/entities/deduction.entity';
import { PayrollApproval } from '../../modules/hrm/payroll/entities/payroll-approval.entity';
import { PayrollItem } from '../../modules/hrm/payroll/entities/payroll-item.entity';
import { PayrollRun } from '../../modules/hrm/payroll/entities/payroll-run.entity';
import { Payslip } from '../../modules/hrm/payroll/entities/payslip.entity';
import { TaxSlab } from '../../modules/hrm/payroll/entities/tax-slab.entity';
import { JobApplication } from '../../modules/hrm/recruitment/entities/job-application.entity';
import { Job } from '../../modules/hrm/recruitment/entities/job.entity';

export const tenantEntities = [
  CompanySettings,
  Permission,
  Role,
  RolePermission,
  MembershipRole,
  Branch,
  Department,
  Designation,
  EmploymentType,
  EmploymentStatus,
  DocumentType,
  Employee,
  EmployeeDocument,
  EmploymentHistory,
  Shift,
  ShiftAssignment,
  Holiday,
  Attendance,
  AttendanceRequest,
  LeaveType,
  LeaveBalance,
  Leave,
  Compensation,
  PayrollAllowance,
  PayrollDeduction,
  TaxSlab,
  PayrollRun,
  PayrollItem,
  PayrollApproval,
  Payslip,
  Job,
  JobApplication,
];
