import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Consent } from '../../database/models';
import { CryptoService } from '../../common/crypto/crypto.service';
import { CONSENT_TEMPLATES, ConsentTemplate } from './consent-templates';
import { ConsentType } from '../../common/utils/enums';
import { ClientMeta } from '../../common/decorators/client-meta.decorator';

export interface ConsentSubmission {
  type: ConsentType;
  /** True state of the checkbox. A false value is stored, not silently dropped. */
  accepted: boolean;
  /** Version the browser actually rendered - mismatches are rejected. */
  versionId?: string;
  timezone?: string;
}

@Injectable()
export class ConsentsService {
  private readonly logger = new Logger(ConsentsService.name);

  constructor(
    @Inject(Consent) private readonly consentModel: typeof Consent,
    private readonly crypto: CryptoService,
  ) {}

  templates() {
    return Object.values(CONSENT_TEMPLATES).map((t) => ({
      type: t.type,
      versionId: t.versionId,
      step: t.step,
      label: t.label,
      text: t.text,
      namedParties: t.namedParties ?? null,
      links: t.links ?? null,
    }));
  }

  /**
   * Stores one immutable evidence row per consent.
   *
   * Captures: full text as displayed, its hash, version id, timestamp with
   * timezone, IP, user agent, page URL, checkbox state, and the Jornaya /
   * TrustedForm certificates.
   */
  async recordMany(
    applicationUuid: string,
    step: 1 | 2 | 3,
    submissions: ConsentSubmission[],
    meta: ClientMeta,
    required: ConsentType[],
  ): Promise<string[]> {
    const byType = new Map(submissions.map((s) => [s.type, s]));

    for (const type of required) {
      const sub = byType.get(type);
      if (!sub || sub.accepted !== true) {
        throw new BadRequestException({
          message: 'A required consent was not given.',
          field: `consents.${type}`,
          consentType: type,
        });
      }
    }

    const now = new Date();
    const rows: string[] = [];

    for (const sub of submissions) {
      const template: ConsentTemplate = CONSENT_TEMPLATES[sub.type];
      if (!template) {
        throw new BadRequestException(`Unknown consent type: ${sub.type}`);
      }
      if (sub.versionId && sub.versionId !== template.versionId) {
        // The page was open while we shipped new wording. Make them re-consent
        // to the current text rather than record a consent to text we cannot prove.
        throw new BadRequestException({
          message: 'Consent wording has been updated. Please review and accept again.',
          field: `consents.${sub.type}`,
          consentType: sub.type,
          currentVersionId: template.versionId,
        });
      }

      const created = await this.consentModel.create({
        applicationId: applicationUuid,
        consentType: template.type,
        step,
        consentText: template.text,
        consentTextHash: this.crypto.sha256(template.text),
        versionId: template.versionId,
        checkboxState: !!sub.accepted,
        namedParties: template.namedParties ?? null,
        consentedAt: now,
        timezone: sub.timezone || meta.timezone || null,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        pageUrl: meta.pageUrl,
        jornayaLeadid: meta.jornayaLeadid,
        trustedformCertUrl: meta.trustedformCertUrl,
      } as any);

      rows.push(created.id);
    }

    return rows;
  }

  async listForApplication(applicationUuid: string) {
    return this.consentModel.findAll({
      where: { applicationId: applicationUuid },
      order: [['consentedAt', 'ASC']],
    });
  }

  /** Used when an applicant revokes (e.g. replies STOP, or revokes ACH). */
  async revoke(applicationUuid: string, type: ConsentType, method: string) {
    const [count] = await this.consentModel.update(
      { revokedAt: new Date(), revocationMethod: method },
      { where: { applicationId: applicationUuid, consentType: type, revokedAt: null } },
    );
    this.logger.log(`Revoked ${count} "${type}" consent(s) for application ${applicationUuid}`);
    return count;
  }
}
