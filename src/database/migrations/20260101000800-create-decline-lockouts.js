'use strict';

/**
 * 90-day decline lockout, keyed on the identity signals available at the time
 * of decline. Kept separate from `applications` so the lockout survives the
 * retention purge that strips SSN and bank data from the application row.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('decline_lockouts', {
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      /** Null once the source application is purged - the lockout still stands. */
      source_application_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'applications', key: 'id' },
        onDelete: 'SET NULL',
      },
      application_ref: { type: DataTypes.STRING(24), allowNull: false },
      email: { type: DataTypes.STRING(254), allowNull: true },
      phone: { type: DataTypes.STRING(10), allowNull: true },
      date_of_birth: { type: DataTypes.DATEONLY, allowNull: true },
      last_name: { type: DataTypes.STRING(40), allowNull: true },
      ssn_blind_index: { type: DataTypes.STRING(64), allowNull: true },
      declined_at: { type: DataTypes.DATE, allowNull: false },
      /** declined_at + DECLINE_LOCKOUT_DAYS, measured from original submission. */
      lockout_until: { type: DataTypes.DATE, allowNull: false },
      decline_stage: { type: DataTypes.STRING(20), allowNull: false },
      reason_codes: { type: DataTypes.JSONB, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('decline_lockouts', ['email']);
    await queryInterface.addIndex('decline_lockouts', ['phone']);
    await queryInterface.addIndex('decline_lockouts', ['ssn_blind_index']);
    await queryInterface.addIndex('decline_lockouts', ['lockout_until']);
    await queryInterface.addIndex('decline_lockouts', ['date_of_birth', 'last_name'], {
      name: 'decline_lockouts_dob_lastname_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('decline_lockouts');
  },
};
