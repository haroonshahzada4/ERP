import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireFeatures } from '../../../common/decorators/features.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ApplicationStatus } from './entities/job-application.entity';
import { JobStatus } from './entities/job.entity';
import { RecruitmentService } from './recruitment.service';

class CreateJobDto {
  title!: string;
  description?: string;
  departmentId?: number | null;
  status?: JobStatus;
}

class UpdateJobDto {
  title?: string;
  description?: string | null;
  departmentId?: number | null;
  status?: JobStatus;
}

class CreateApplicationDto {
  jobId!: number;
  candidateName!: string;
  candidateEmail!: string;
  notes?: string;
}

class StatusDto {
  status!: ApplicationStatus;
}

@ApiTags('hrm/recruitment')
@ApiBearerAuth()
@RequireFeatures('hrm.recruitment')
@Controller('recruitment')
export class RecruitmentController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Get('jobs')
  @RequirePermissions('recruitment.read')
  listJobs() {
    return this.recruitment.listJobs();
  }

  @Post('jobs')
  @RequirePermissions('recruitment.write')
  createJob(@Body() dto: CreateJobDto) {
    return this.recruitment.createJob(dto);
  }

  @Patch('jobs/:id')
  @RequirePermissions('recruitment.write')
  updateJob(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJobDto) {
    return this.recruitment.updateJob(id, dto);
  }

  @Get('applications')
  @RequirePermissions('recruitment.read')
  listApplications(@Query('jobId') jobId?: string) {
    return this.recruitment.listApplications(
      jobId ? Number(jobId) : undefined,
    );
  }

  @Post('applications')
  @RequirePermissions('recruitment.write')
  createApplication(@Body() dto: CreateApplicationDto) {
    return this.recruitment.createApplication(dto);
  }

  @Patch('applications/:id/status')
  @RequirePermissions('recruitment.write')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StatusDto,
  ) {
    return this.recruitment.updateApplicationStatus(id, dto.status);
  }
}
