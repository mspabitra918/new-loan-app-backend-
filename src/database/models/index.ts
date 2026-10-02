export * from './application.model';
export * from './consent.model';
export * from './application-event.model';
export * from './admin-user.model';
export * from './sensitive-access-log.model';
export * from './email-log.model';
export * from './fedach-participant.model';
export * from './decline-lockout.model';
export * from './bank-verification-email.model';

import { Application } from './application.model';
import { Consent } from './consent.model';
import { ApplicationEvent } from './application-event.model';
import { AdminUser } from './admin-user.model';
import { SensitiveAccessLog } from './sensitive-access-log.model';
import { EmailLog } from './email-log.model';
import { FedachParticipant } from './fedach-participant.model';
import { DeclineLockout } from './decline-lockout.model';
import { BankVerificationEmail } from './bank-verification-email.model';

export const ALL_MODELS = [
  Application,
  Consent,
  ApplicationEvent,
  AdminUser,
  SensitiveAccessLog,
  EmailLog,
  FedachParticipant,
  DeclineLockout,
  BankVerificationEmail,
];
