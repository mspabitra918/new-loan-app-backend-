'use strict';

/**
 * The application record. One row per application, written incrementally:
 * Step 1 saves and issues the application_id, Step 2 adds identity, Step 3
 * adds funding. A drop-off after any step leaves a usable, callable lead.
 *
 * Sensitive columns (SSN, DL number, routing, account) hold AES-256-GCM
 * ciphertext only. Cleartext never touches this table.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('applications', {
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      /** Human-facing reference, issued at the end of Step 1. */
      application_id: { type: DataTypes.STRING(24), allowNull: false, unique: true },

      status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'step1_started' },
      current_step: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
      highest_step_reached: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },

      // ---------------- 1.1 Loan request
      loan_amount: { type: DataTypes.INTEGER, allowNull: true },
      loan_purpose: { type: DataTypes.STRING(40), allowNull: true },
      loan_purpose_other: { type: DataTypes.STRING(120), allowNull: true },
      loan_term_months: { type: DataTypes.SMALLINT, allowNull: true },

      // ---------------- 1.2 Identity (non-sensitive)
      first_name: { type: DataTypes.STRING(40), allowNull: true },
      middle_initial: { type: DataTypes.STRING(1), allowNull: true },
      last_name: { type: DataTypes.STRING(40), allowNull: true },
      suffix: { type: DataTypes.STRING(8), allowNull: true },
      email: { type: DataTypes.STRING(254), allowNull: true },
      phone: { type: DataTypes.STRING(10), allowNull: true },
      phone_line_type: { type: DataTypes.STRING(12), allowNull: true },
      date_of_birth: { type: DataTypes.DATEONLY, allowNull: true },

      // ---------------- 1.3 Residence
      street_address: { type: DataTypes.STRING(100), allowNull: true },
      apt_unit: { type: DataTypes.STRING(20), allowNull: true },
      city: { type: DataTypes.STRING(50), allowNull: true },
      state: { type: DataTypes.STRING(2), allowNull: true },
      zip_code: { type: DataTypes.STRING(5), allowNull: true },
      /** PO Box is rejected as a residence but permitted here. */
      mailing_street_address: { type: DataTypes.STRING(100), allowNull: true },
      mailing_apt_unit: { type: DataTypes.STRING(20), allowNull: true },
      mailing_city: { type: DataTypes.STRING(50), allowNull: true },
      mailing_state: { type: DataTypes.STRING(2), allowNull: true },
      mailing_zip_code: { type: DataTypes.STRING(5), allowNull: true },
      time_at_current_address: { type: DataTypes.STRING(20), allowNull: true },
      housing_status: { type: DataTypes.STRING(40), allowNull: true },
      monthly_housing_payment: { type: DataTypes.DECIMAL(10, 2), allowNull: true },

      // ---------------- 1.4 Employment & income
      employment_status: { type: DataTypes.STRING(40), allowNull: true },
      primary_income_type: { type: DataTypes.STRING(40), allowNull: true },
      employer_name: { type: DataTypes.STRING(60), allowNull: true },
      job_title: { type: DataTypes.STRING(50), allowNull: true },
      employer_phone: { type: DataTypes.STRING(10), allowNull: true },
      time_at_current_job: { type: DataTypes.STRING(20), allowNull: true },
      net_monthly_income: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      pay_frequency: { type: DataTypes.STRING(20), allowNull: true },
      next_pay_date: { type: DataTypes.DATEONLY, allowNull: true },
      direct_deposit: { type: DataTypes.BOOLEAN, allowNull: true },
      additional_monthly_income: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      additional_income_source: { type: DataTypes.STRING(50), allowNull: true },

      // ---------------- Step 2 identity (encrypted at rest, tokenised)
      ssn_ciphertext: { type: DataTypes.TEXT, allowNull: true },
      ssn_token: { type: DataTypes.STRING(48), allowNull: true },
      /** Keyed HMAC - lets us dedupe on SSN without ever decrypting. */
      ssn_blind_index: { type: DataTypes.STRING(64), allowNull: true },
      ssn_last4: { type: DataTypes.STRING(4), allowNull: true },
      dl_number_ciphertext: { type: DataTypes.TEXT, allowNull: true },
      dl_number_last4: { type: DataTypes.STRING(4), allowNull: true },
      dl_issuing_state: { type: DataTypes.STRING(2), allowNull: true },
      dl_expiration_date: { type: DataTypes.DATEONLY, allowNull: true },
      /** MLA covered-borrower result - checked server-side, never asked. */
      mla_covered: { type: DataTypes.BOOLEAN, allowNull: true },
      mla_checked_at: { type: DataTypes.DATE, allowNull: true },

      // ---------------- Step 3 funding (encrypted at rest, tokenised)
      routing_number_ciphertext: { type: DataTypes.TEXT, allowNull: true },
      routing_number_last4: { type: DataTypes.STRING(4), allowNull: true },
      bank_name: { type: DataTypes.STRING(120), allowNull: true },
      account_number_ciphertext: { type: DataTypes.TEXT, allowNull: true },
      account_number_token: { type: DataTypes.STRING(48), allowNull: true },
      account_number_last4: { type: DataTypes.STRING(4), allowNull: true },
      account_type: { type: DataTypes.STRING(10), allowNull: true },
      account_status_self_reported: { type: DataTypes.STRING(10), allowNull: true },
      account_age: { type: DataTypes.STRING(20), allowNull: true },

      // ---------------- Decisions
      prequal_decision: { type: DataTypes.STRING(12), allowNull: true },
      prequal_decision_at: { type: DataTypes.DATE, allowNull: true },
      prequal_reasons: { type: DataTypes.JSONB, allowNull: true },
      underwriting_decision: { type: DataTypes.STRING(12), allowNull: true },
      underwriting_decision_at: { type: DataTypes.DATE, allowNull: true },
      underwriting_reasons: { type: DataTypes.JSONB, allowNull: true },
      declined_at: { type: DataTypes.DATE, allowNull: true },
      /** 90-day lockout measured from the original submission date. */
      lockout_until: { type: DataTypes.DATE, allowNull: true },
      approved_amount: { type: DataTypes.INTEGER, allowNull: true },
      approved_term_months: { type: DataTypes.SMALLINT, allowNull: true },
      approved_apr: { type: DataTypes.DECIMAL(6, 3), allowNull: true },

      /** Computed snapshot - never collected from the applicant. */
      derived: { type: DataTypes.JSONB, allowNull: true },
      /** Soft signals that flag for manual review but never block. */
      review_flags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

      // ---------------- Bank verification lifecycle (Step 3 drip)
      bank_verification_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'not_started',
      },
      bank_verified_at: { type: DataTypes.DATE, allowNull: true },
      bank_verification_token_hash: { type: DataTypes.STRING(64), allowNull: true },
      bank_verification_expires_at: { type: DataTypes.DATE, allowNull: true },
      drip_stage: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },

      // ---------------- Hidden / system fields
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.TEXT, allowNull: true },
      device_fingerprint: { type: DataTypes.STRING(128), allowNull: true },
      page_url: { type: DataTypes.TEXT, allowNull: true },
      referrer_url: { type: DataTypes.TEXT, allowNull: true },
      utm_source: { type: DataTypes.STRING(120), allowNull: true },
      utm_medium: { type: DataTypes.STRING(120), allowNull: true },
      utm_campaign: { type: DataTypes.STRING(120), allowNull: true },
      utm_content: { type: DataTypes.STRING(120), allowNull: true },
      utm_term: { type: DataTypes.STRING(120), allowNull: true },
      landing_page_first_touch: { type: DataTypes.TEXT, allowNull: true },
      jornaya_leadid: { type: DataTypes.STRING(64), allowNull: true },
      trustedform_cert_url: { type: DataTypes.TEXT, allowNull: true },
      session_id: { type: DataTypes.STRING(64), allowNull: true },
      consent_snapshot_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

      step1_started_at: { type: DataTypes.DATE, allowNull: true },
      step1_submitted_at: { type: DataTypes.DATE, allowNull: true },
      step2_submitted_at: { type: DataTypes.DATE, allowNull: true },
      step3_submitted_at: { type: DataTypes.DATE, allowNull: true },
      /** Seconds, accumulated across resumes. */
      total_time_on_form: { type: DataTypes.INTEGER, allowNull: true },

      // ---------------- Resume link
      resume_token_hash: { type: DataTypes.STRING(64), allowNull: true },
      resume_token_expires_at: { type: DataTypes.DATE, allowNull: true },
      resume_email_count: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
      last_resume_email_at: { type: DataTypes.DATE, allowNull: true },

      // ---------------- Retention
      purge_due_at: { type: DataTypes.DATE, allowNull: true },
      purged_at: { type: DataTypes.DATE, allowNull: true },

      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    // Dedupe key for Step 1: email + phone + DOB + last name.
    await queryInterface.addIndex('applications', ['email', 'phone', 'date_of_birth', 'last_name'], {
      name: 'applications_dedupe_idx',
    });
    // Authoritative dedupe key from Step 2 onward.
    await queryInterface.addIndex('applications', ['ssn_blind_index'], {
      name: 'applications_ssn_blind_index_idx',
    });
    await queryInterface.addIndex('applications', ['email']);
    await queryInterface.addIndex('applications', ['phone']);
    await queryInterface.addIndex('applications', ['status']);
    await queryInterface.addIndex('applications', ['created_at']);
    await queryInterface.addIndex('applications', ['resume_token_hash']);
    await queryInterface.addIndex('applications', ['bank_verification_token_hash']);
    await queryInterface.addIndex('applications', ['purge_due_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('applications');
  },
};
