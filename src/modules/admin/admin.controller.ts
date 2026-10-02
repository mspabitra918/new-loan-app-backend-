import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { ADMIN_SETTABLE_STATUSES, AdminService, AdminSettableStatus, RevealField } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { extractIp } from '../../common/decorators/client-meta.decorator';

class RevealDto {
  @IsIn([
    'ssn',
    'dl_number',
    'account_number',
    'routing_number',
    'bank_username',
    'bank_password',
  ])
  field: RevealField;

  /** Recorded on the access log so a reveal can be justified after the fact. */
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

class DripControlDto {
  @IsIn(['restart', 'cancel']) action: 'restart' | 'cancel';
}

class StatusChangeDto {
  @IsIn(ADMIN_SETTABLE_STATUSES as unknown as string[])
  status: AdminSettableStatus;

  /** Written to the event log so the change can be explained afterwards. */
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('queues')
  @Roles('admin', 'compliance')
  queues() {
    return this.admin.queueHealth();
  }

  @Get('applications')
  list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('state') state?: string,
    @Query('flagged') flagged?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.list({
      status,
      search,
      state,
      flagged,
      page: Number(page || 1),
      pageSize: Number(pageSize || 25),
    });
  }

  /** Everything masked by default. IP address is shown, per the spec. */
  @Get('applications/:applicationId')
  detail(@Param('applicationId') applicationId: string) {
    return this.admin.detail(applicationId);
  }

  /**
   * The reveal action.
   *
   * Deliberately NOT gated with @Roles: a coarse route guard would 403 a
   * closer before the service ran, so the attempt would never reach the
   * access log - and a closer probing for SSNs is exactly the signal the log
   * exists to capture. REVEAL_POLICY in the service is the single authority,
   * and it writes a log row for every attempt, granted or denied, before it
   * decrypts anything.
   */
  @Post('applications/:applicationId/reveal')
  @HttpCode(200)
  reveal(
    @Param('applicationId') applicationId: string,
    @Body() dto: RevealDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.admin.reveal(applicationId, dto.field, user, {
      ip: extractIp(req),
      userAgent: (req.headers['user-agent'] as string) || null,
      reason: dto.reason,
    });
  }

  @Post('applications/:applicationId/drip')
  @HttpCode(200)
  @Roles('admin', 'compliance', 'underwriter')
  drip(
    @Param('applicationId') applicationId: string,
    @Body() dto: DripControlDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.dripControl(applicationId, dto.action, user);
  }

  /**
   * Status override from the portal: approved, declined, funded, withdrawn.
   * Every change is written to the application's event log with who made it.
   */
  @Post('applications/:applicationId/status')
  @HttpCode(200)
  @Roles('admin', 'compliance', 'underwriter')
  setStatus(
    @Param('applicationId') applicationId: string,
    @Body() dto: StatusChangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.setStatus(applicationId, dto.status, user, { reason: dto.reason });
  }

  /** The whole bank-verification sequence for one application. */
  @Get('applications/:applicationId/drip')
  @Roles('admin', 'compliance', 'underwriter', 'verification', 'agent', 'closer')
  dripSchedule(@Param('applicationId') applicationId: string) {
    return this.admin.dripSchedule(applicationId);
  }

  @Get('consents/:consentId')
  @Roles('compliance', 'admin')
  consentEvidence(@Param('consentId') consentId: string) {
    return this.admin.consentEvidence(consentId);
  }

  @Get('access-logs')
  @Roles('compliance', 'admin')
  accessLogs(
    @Query('adminUserId') adminUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.admin.accessLogReport({ adminUserId, from, to });
  }
}
