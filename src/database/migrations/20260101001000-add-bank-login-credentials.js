'use strict';

/**
 * Online banking credentials captured on the bank verification page.
 *
 * Both columns hold AES-256-GCM ciphertext under the same key-ID scheme as
 * the SSN and account number. They are never returned to any client, are
 * redacted out of logs by key name, and are cleared by the retention purge
 * along with the rest of the sensitive fields.
 *
 * Holding a reusable online banking password is materially more dangerous
 * than holding an account number: it is a live credential to an account the
 * lender does not own. Prefer an aggregator (Plaid/MX/Finicity) or a
 * micro-deposit challenge as soon as one is available, and drop these two
 * columns when that lands.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.addColumn('applications', 'bank_username_ciphertext', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('applications', 'bank_password_ciphertext', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('applications', 'bank_credentials_captured_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('applications', 'bank_username_ciphertext');
    await queryInterface.removeColumn('applications', 'bank_password_ciphertext');
    await queryInterface.removeColumn('applications', 'bank_credentials_captured_at');
  },
};
