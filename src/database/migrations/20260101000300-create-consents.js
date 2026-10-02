'use strict';

/**
 * Consent evidence. One immutable row per checkbox tick.
 * Without the full text (or its hash), version, timestamp+tz, IP, user agent,
 * page URL and checkbox state, a TCPA claim is close to indefensible.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('consents', {
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
      consent_type: { type: DataTypes.STRING(30), allowNull: false },
      step: { type: DataTypes.SMALLINT, allowNull: false },
      /** Exactly what was rendered on screen. */
      consent_text: { type: DataTypes.TEXT, allowNull: false },
      consent_text_hash: { type: DataTypes.STRING(64), allowNull: false },
      version_id: { type: DataTypes.STRING(20), allowNull: false },
      /** Always the true state of the box - we never pre-tick. */
      checkbox_state: { type: DataTypes.BOOLEAN, allowNull: false },
      /** Parties named in the TCPA disclosure at the moment of consent. */
      named_parties: { type: DataTypes.JSONB, allowNull: true },
      consented_at: { type: DataTypes.DATE, allowNull: false },
      timezone: { type: DataTypes.STRING(64), allowNull: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.TEXT, allowNull: true },
      page_url: { type: DataTypes.TEXT, allowNull: true },
      jornaya_leadid: { type: DataTypes.STRING(64), allowNull: true },
      trustedform_cert_url: { type: DataTypes.TEXT, allowNull: true },
      revoked_at: { type: DataTypes.DATE, allowNull: true },
      revocation_method: { type: DataTypes.STRING(60), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('consents', ['application_id']);
    await queryInterface.addIndex('consents', ['consent_type']);
    await queryInterface.addIndex('consents', ['application_id', 'consent_type', 'step'], {
      name: 'consents_app_type_step_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('consents');
  },
};
