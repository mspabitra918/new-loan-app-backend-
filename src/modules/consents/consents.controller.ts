import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ConsentsService } from './consents.service';
import { consentTemplatesForStep } from './consent-templates';
import { Public } from '../../common/decorators/roles.decorator';

@Public() // Consent wording must be readable before anyone authenticates.
@Controller('consents')
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  /** The form renders each of these as its own unchecked checkbox. */
  @Get('templates')
  templates(@Query('step') step?: string) {
    if (step) {
      const n = Number(step);
      if (n === 1 || n === 2 || n === 3) return consentTemplatesForStep(n);
    }
    return this.consents.templates();
  }
}
