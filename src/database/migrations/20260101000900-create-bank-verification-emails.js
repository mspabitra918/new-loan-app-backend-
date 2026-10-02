'use strict';

/**
 * The bank-verification drip schedule.
 *
 * One row per planned email, written when Step 3 is submitted: six rows over
 * three days, two a day. The schedule lives in the database rather than only
 * in a queue so it can be read, audited and reported on - "what is still
 * going out for this applicant, and when" is a question the admin portal has
 * to answer without inspecting Redis.
 *
 * status: scheduled -> sending -> sent | failed, or cancelled when the
 * applicant verifies before the row comes due.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('bank_verification_emails', {
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      application_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'applications', key: 'id' },
        onDelete: 'CASCADE',
      },
      /** 1..6 - position in the sequence for this application. */
      sequence: { type: DataTypes.SMALLINT, allowNull: false },
      /** 1..3 - which day of the three-day sequence this belongs to. */
      day: { type: DataTypes.SMALLINT, allowNull: false },
      /** The template key that will be rendered, e.g. bank_verification_day2. */
      email_type: { type: DataTypes.STRING(60), allowNull: false },
      scheduled_at: { type: DataTypes.DATE, allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'scheduled' },
      attempts: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      cancelled_at: { type: DataTypes.DATE, allowNull: true },
      /** Why the row stopped: verified, resubmitted, purged, terminal status. */
      cancel_reason: { type: DataTypes.STRING(60), allowNull: true },
      last_error: { type: DataTypes.TEXT, allowNull: true },
      /** Links the schedule row to the delivery record it produced. */
      email_log_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'email_logs', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('bank_verification_emails', ['application_id']);
    // The runner's only query: due rows, oldest first.
    await queryInterface.addIndex('bank_verification_emails', ['status', 'scheduled_at'], {
      name: 'bank_verification_emails_due_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('bank_verification_emails');
  },
};
