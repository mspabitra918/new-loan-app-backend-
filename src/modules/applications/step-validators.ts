import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LookupService } from "../lookup/lookup.service";
import { Step1Dto } from "./dto/step1.dto";
import { Step2Dto } from "./dto/step2.dto";
import { Step3Dto } from "./dto/step3.dto";
import {
  DERIVED_INCOME_TYPE,
  EMPLOYER_FIELD_STATUSES,
  HOUSING_STATUSES_REQUIRING_PAYMENT,
} from "../../common/utils/enums";
import {
  getStateRule,
  isDriverLicenseValid,
  isZipValidForState,
} from "../../common/utils/us-states";
import {
  availableTerms,
  isValidAmount,
  RESIDENCE_TENURE_MONTHS,
} from "../../common/utils/loan-rules";
import {
  accountLast4,
  digitsOnly,
  isFutureDate,
  isPoBox,
  isValidAccountNumber,
  isValidDob,
  isValidName,
  isValidRoutingNumber,
  isValidSsn,
  isValidUsPhone,
  isWithinDays,
} from "../../common/utils/validators";

/** field path -> message. The form renders each beside its input. */
export type FieldErrors = Record<string, string>;

export interface ValidationOutcome {
  errors: FieldErrors;
  /** Soft signals. These never block - they flag for manual review. */
  flags: string[];
  /** Values the server derived or corrected (bank name, income type, phone line type). */
  derivedValues: Record<string, unknown>;
}

@Injectable()
export class StepValidators {
  constructor(
    private readonly lookup: LookupService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------------ Step 1

  async validateStep1(dto: Step1Dto): Promise<ValidationOutcome> {
    const errors: FieldErrors = {};
    const flags: string[] = [];
    const derivedValues: Record<string, unknown> = {};

    // --- names (character set, no digits, no emoji)
    if (!isValidName(dto.firstName)) {
      errors.firstName =
        "Use letters, spaces, hyphens, apostrophes and periods only.";
    }
    if (!isValidName(dto.lastName)) {
      errors.lastName =
        "Use letters, spaces, hyphens, apostrophes and periods only.";
    }

    // --- email: confirm match, then syntax + MX + disposable + typo prompt
    if (
      dto.email?.trim().toLowerCase() !== dto.confirmEmail?.trim().toLowerCase()
    ) {
      errors.confirmEmail = "Email addresses do not match.";
    } else {
      const check = await this.lookup.checkEmail(dto.email);
      if (!check.valid) {
        errors.email =
          check.reason === "disposable"
            ? "Temporary or disposable email addresses are not accepted."
            : check.reason === "no_mx"
              ? "That email domain cannot receive mail. Please check the spelling."
              : "Enter a valid email address.";
        if (check.suggestion) derivedValues.emailSuggestion = check.suggestion;
      } else if (check.suggestion) {
        // Valid, but likely a typo - the form prompts "Did you mean ...?"
        derivedValues.emailSuggestion = check.suggestion;
      }
    }

    // --- phone: format, NPA/NXX rules, line type (VOIP flags, never blocks)
    const phone = await this.lookup.checkPhone(dto.phone);
    if (!phone.valid) {
      errors.phone = "Enter a valid 10-digit US mobile number.";
    } else {
      derivedValues.phoneLineType = phone.lineType;
      if (phone.flag) flags.push(phone.flag);
    }

    // --- date of birth
    if (!isValidDob(dto.dateOfBirth)) {
      errors.dateOfBirth = "You must be between 18 and 100 years old to apply.";
    }

    // --- residence
    if (isPoBox(dto.streetAddress)) {
      errors.streetAddress =
        "A PO Box cannot be used as your home address. You can add it as a mailing address instead.";
    }
    if (!isZipValidForState(dto.zipCode, dto.state)) {
      errors.zipCode = "That ZIP code does not match the state you selected.";
    }

    const stateRule = getStateRule(dto.state);
    if (!stateRule || !stateRule.licensed) {
      errors.state = `We are not currently licensed to lend in ${stateRule?.name ?? "that state"}.`;
    }

    // --- loan request, against state rules
    if (!isValidAmount(dto.loanAmount, dto.state)) {
      errors.loanAmount = stateRule?.licensed
        ? `Choose an amount between $${Math.max(1000, stateRule.minAmount).toLocaleString()} and ` +
          `$${Math.min(10000, stateRule.maxAmount).toLocaleString()}, in $500 steps.`
        : "Choose an amount between $1,000 and $10,000, in $500 steps.";
    }

    const totalIncome =
      (dto.netMonthlyIncome || 0) + (dto.additionalMonthlyIncome || 0);
    const terms = availableTerms(
      dto.loanAmount,
      dto.state,
      totalIncome,
      this.config.get<number>("policy.defaultApr"),
      this.config.get<number>("policy.affordabilityPtiMax"),
    );
    if (!terms.includes(dto.loanTermMonths)) {
      errors.loanTermMonths = `That term is not available for this amount. Available: ${terms.join(", ")} months.`;
    }
    derivedValues.availableTerms = terms;

    // --- field 3: purpose detail
    if (dto.loanPurpose === "other_personal_expenses") {
      const detail = (dto.loanPurposeOther || "").trim();
      if (detail.length < 3 || detail.length > 120) {
        errors.loanPurposeOther =
          "Tell us briefly what the loan is for (3-120 characters).";
      }
    }

    // --- field 20: housing payment
    if (HOUSING_STATUSES_REQUIRING_PAYMENT.includes(dto.housingStatus)) {
      if (dto.monthlyHousingPayment == null) {
        errors.monthlyHousingPayment = "Enter your monthly housing payment.";
      }
    }

    // --- fields 23-26: employer block, only where it applies
    const needsEmployer = EMPLOYER_FIELD_STATUSES.includes(
      dto.employmentStatus,
    );
    if (needsEmployer) {
      if (!dto.employerName || dto.employerName.trim().length < 2) {
        errors.employerName = "Enter your employer name.";
      }
      if (!dto.jobTitle || dto.jobTitle.trim().length < 2) {
        errors.jobTitle = "Enter your job title.";
      }
      if (!dto.employerPhone || !isValidUsPhone(dto.employerPhone)) {
        errors.employerPhone = "Enter a valid 10-digit employer phone number.";
      }
      if (!dto.timeAtCurrentJob) {
        errors.timeAtCurrentJob = "Select how long you have been at this job.";
      }
    }

    // --- field 22: income type, only where employment status leaves it ambiguous
    const autoIncomeType = DERIVED_INCOME_TYPE[dto.employmentStatus];
    if (autoIncomeType) {
      derivedValues.primaryIncomeType = autoIncomeType;
    } else if (!dto.primaryIncomeType) {
      errors.primaryIncomeType = "Select your main source of income.";
    } else {
      derivedValues.primaryIncomeType = dto.primaryIncomeType;
    }

    // --- field 29: next pay date
    if (dto.payFrequency !== "irregular") {
      if (!dto.nextPayDate) {
        errors.nextPayDate = "Enter your next pay date.";
      } else if (!isFutureDate(dto.nextPayDate)) {
        errors.nextPayDate = "Your next pay date must be in the future.";
      } else if (!isWithinDays(dto.nextPayDate, 35)) {
        errors.nextPayDate =
          "Your next pay date must be within the next 35 days.";
      }
    }

    // --- field 32: additional income source
    if ((dto.additionalMonthlyIncome || 0) > 0) {
      if (
        !dto.additionalIncomeSource ||
        dto.additionalIncomeSource.trim().length < 2
      ) {
        errors.additionalIncomeSource =
          "Tell us where this additional income comes from.";
      }
    }

    // --- soft signals: flag for review, never block (UX rule 2)
    if (dto.netMonthlyIncome < 1200) flags.push("income_below_1200");
    if (dto.netMonthlyIncome > 20000) flags.push("income_above_20000");
    if (RESIDENCE_TENURE_MONTHS[dto.timeAtCurrentAddress] < 6)
      flags.push("short_address_tenure");
    if (needsEmployer && dto.timeAtCurrentJob === "under_3_months")
      flags.push("short_job_tenure");
    if (!dto.directDeposit) flags.push("no_direct_deposit");
    if (dto.mailingStreetAddress && isPoBox(dto.mailingStreetAddress)) {
      flags.push("po_box_mailing_address");
    }

    return { errors, flags, derivedValues };
  }

  // ------------------------------------------------------------------ Step 2

  validateStep2(dto: Step2Dto): ValidationOutcome {
    const errors: FieldErrors = {};
    const flags: string[] = [];
    const derivedValues: Record<string, unknown> = {};

    const ssn = digitsOnly(dto.ssn);
    const confirm = digitsOnly(dto.confirmSsn);

    if (ssn !== confirm) {
      // Never restate the value - just say it does not match.
      errors.confirmSsn = "The Social Security numbers do not match.";
    } else if (!isValidSsn(ssn)) {
      errors.ssn =
        "That Social Security number is not valid. Please check and re-enter it.";
    }

    // if (!isDriverLicenseValid(dto.driversLicenseNumber, dto.dlIssuingState)) {
    //   errors.driversLicenseNumber = `That does not match the licence format used by ${dto.dlIssuingState}.`;
    // }

    if (!isFutureDate(dto.dlExpirationDate)) {
      errors.dlExpirationDate = "Your licence must not be expired.";
    }

    return { errors, flags, derivedValues };
  }

  // ------------------------------------------------------------------ Step 3

  validateStep3(dto: Step3Dto): ValidationOutcome {
    const errors: FieldErrors = {};
    const flags: string[] = [];
    const derivedValues: Record<string, unknown> = {};

    const routing = digitsOnly(dto.routingNumber);
    if (!isValidRoutingNumber(routing)) {
      errors.routingNumber =
        "That routing number is not valid. Check the 9 digits and try again.";
    } else {
      const found = this.lookup.lookupRoutingNumber(routing);
      if (found.flag) flags.push(found.flag);
      // Field 44 is typed by the applicant. The FedACH name is only a fallback
      // for a client that did not send one.
      derivedValues.bankName =
        dto.bankName?.trim()?.slice(0, 120) ||
        found.bankName ||
        "Unrecognised institution";
    }

    const account = digitsOnly(dto.accountNumber);
    const accountConfirm = digitsOnly(dto.confirmAccountNumber);

    if (!isValidAccountNumber(account)) {
      errors.accountNumber = "Enter your account number (4 to 17 digits).";
    } else if (account !== accountConfirm) {
      errors.confirmAccountNumber = "The account numbers do not match.";
    } else {
      derivedValues.accountNumberLast4 = accountLast4(account);
    }

    // --- soft signals
    if (dto.accountStatusSelfReported === "negative")
      flags.push("negative_account_status");
    if (dto.accountAge === "under_6_months") flags.push("new_bank_account");
    if (dto.accountType === "savings") flags.push("savings_account_funding");

    return { errors, flags, derivedValues };
  }
}
