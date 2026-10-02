import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle as ThrottleDecorator } from '@nestjs/throttler';
import { ApplicationsService } from './applications.service';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { VerifyBankDto } from './dto/verify-bank.dto';
import { ClientMeta, GetClientMeta } from '../../common/decorators/client-meta.decorator';
import { Public } from '../../common/decorators/roles.decorator';
import { IsEmail, IsString, Length } from 'class-validator';

class StatusLookupDto {
  @IsString() @Length(1, 24) applicationId: string;
  @IsEmail() email: string;
}

/**
 * Public application API. One submit endpoint carries the whole application;
 * the rest is status lookup and bank verification.
 *
 * There is no per-screen save and no resume link: an application exists only
 * once it is complete, so there is nothing part-finished to come back to.
 */
@Public() // The applicant-facing API: no admin session, by design.
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  /** Called on first paint of Step 1. */
  @Post('session')
  @HttpCode(200)
  startSession(@GetClientMeta() meta: ClientMeta) {
    return this.applications.startSession(meta);
  }

  /**
   * The whole application, in one request.
   *
   * The form is still three screens - loan request, identity, bank - but the
   * applicant moves between them with Next and Back and nothing is posted
   * until they submit, so every field arrives here together.
   *
   * Everything is validated before anything is stored, and the application is
   * created in a single write. It lands at bank verification pending - no
   * pre-qualification, no underwriting, no decision on this route.
   */
  @Post('submit')
  @HttpCode(200)
  @ThrottleDecorator({ default: { limit: 10, ttl: 60_000 } })
  submit(@Body() dto: SubmitApplicationDto, @GetClientMeta() meta: ClientMeta) {
    return this.applications.submitAll(dto, meta);
  }

  /**
   * Public status lookup for the Loan Status page.
   * Requires the reference AND the email it was filed under - the reference
   * alone is not an authenticator.
   */
  @Post('status')
  @HttpCode(200)
  @ThrottleDecorator({ default: { limit: 8, ttl: 60_000 } })
  status(@Body() dto: StatusLookupDto) {
    return this.applications.lookupStatus(dto.applicationId, dto.email);
  }

  /** Status summary only. Step data requires the emailed resume token. */
  @Get(':applicationId')
  byId(@Param('applicationId') applicationId: string) {
    return this.applications.getByApplicationId(applicationId);
  }

  /**
   * What the bank verification page renders: name, email and the banking
   * institution we derived from the routing number. Resolving the token here
   * does not consume it - an email client prefetching the link must not be
   * able to complete anything.
   */
  @Get('verify-bank/:token')
  @ThrottleDecorator({ default: { limit: 20, ttl: 60_000 } })
  bankVerificationDetails(@Param('token') token: string) {
    return this.applications.getVerificationDetails(token);
  }

  /**
   * Completes bank verification. Reached from the emailed link or from the
   * Status Panel's "Complete Bank Verification" button - both hold a
   * single-use token, so there is one path in.
   */
  @Post('verify-bank/:token')
  @HttpCode(200)
  @ThrottleDecorator({ default: { limit: 8, ttl: 60_000 } })
  verifyBank(
    @Param('token') token: string,
    @Body() dto: VerifyBankDto,
    @GetClientMeta() meta: ClientMeta,
  ) {
    return this.applications.verifyBankAccount(token, dto, meta);
  }
}
