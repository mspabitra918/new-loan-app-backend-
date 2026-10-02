import { Controller, Get, Query } from '@nestjs/common';
import { LookupService } from './lookup.service';
import { Public } from '../../common/decorators/roles.decorator';
import * as E from '../../common/utils/enums';
import { STATE_OPTIONS } from '../../common/utils/us-states';
import { AMOUNT_DEFAULT, AMOUNT_MAX, AMOUNT_MIN, AMOUNT_STEP } from '../../common/utils/loan-rules';

const opts = (values: readonly string[], labels: Record<string, string>) =>
  values.map((v) => ({ value: v, label: labels[v] }));

/**
 * Everything the form needs to render, served from the same tables the
 * validators use - so the UI and the server can never disagree about what
 * a valid option is.
 */
@Public() // Reference data the public form needs to render.
@Controller('lookup')
export class LookupController {
  constructor(private readonly lookup: LookupService) {}

  @Get('options')
  options() {
    return {
      loanAmount: { min: AMOUNT_MIN, max: AMOUNT_MAX, step: AMOUNT_STEP, default: AMOUNT_DEFAULT },
      loanPurposes: opts(E.LOAN_PURPOSES, E.LOAN_PURPOSE_LABELS),
      loanTerms: E.LOAN_TERMS.map((t) => ({ value: t, label: `${t} months` })),
      suffixes: opts(E.SUFFIXES, E.SUFFIX_LABELS),
      states: STATE_OPTIONS,
      residenceTenure: opts(E.RESIDENCE_TENURE, E.RESIDENCE_TENURE_LABELS),
      housingStatuses: opts(E.HOUSING_STATUSES, E.HOUSING_STATUS_LABELS),
      housingStatusesRequiringPayment: E.HOUSING_STATUSES_REQUIRING_PAYMENT,
      employmentStatuses: opts(E.EMPLOYMENT_STATUSES, E.EMPLOYMENT_STATUS_LABELS),
      employerFieldStatuses: E.EMPLOYER_FIELD_STATUSES,
      incomeTypes: opts(E.INCOME_TYPES, E.INCOME_TYPE_LABELS),
      derivedIncomeType: E.DERIVED_INCOME_TYPE,
      jobTenure: opts(E.JOB_TENURE, E.JOB_TENURE_LABELS),
      payFrequencies: opts(E.PAY_FREQUENCIES, E.PAY_FREQUENCY_LABELS),
      accountTypes: [
        { value: 'checking', label: 'Checking' },
        { value: 'savings', label: 'Savings' },
      ],
      accountStatuses: opts(E.ACCOUNT_STATUSES, E.ACCOUNT_STATUS_LABELS),
      accountAges: opts(E.ACCOUNT_AGES, E.ACCOUNT_AGE_LABELS),
      regBNotice: E.REG_B_NOTICE,
    };
  }

  @Get('states')
  states() {
    return this.lookup.states();
  }

  @Get('product-rules')
  productRules(
    @Query('amount') amount: string,
    @Query('state') state: string,
    @Query('income') income?: string,
  ) {
    return this.lookup.productRules(
      Number(amount || AMOUNT_DEFAULT),
      (state || '').toUpperCase(),
      income ? Number(income) : undefined,
    );
  }

  @Get('email')
  checkEmail(@Query('value') value: string) {
    return this.lookup.checkEmail(value);
  }

  @Get('phone')
  checkPhone(@Query('value') value: string) {
    return this.lookup.checkPhone(value);
  }

  @Get('zip')
  checkZip(@Query('zip') zip: string, @Query('state') state: string) {
    return this.lookup.checkZip(zip, (state || '').toUpperCase());
  }

  /** Field 44 - the bank name the applicant is never asked to type. */
  @Get('routing')
  routing(@Query('value') value: string) {
    return this.lookup.lookupRoutingNumber(value);
  }
}
