'use strict';

/**
 * Delivery log for every MailerCloud send, including the BullMQ drip.
 * `template_key` is the only description of content stored here - message
 * bodies are rendered at send time and never persisted with applicant data.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('email_logs', {
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      application_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'applications', key: 'id' },
        onDelete: 'SET NULL',
      },
      template_key: { type: DataTypes.STRING(60), allowNull: false },
      to_email: { type: DataTypes.STRING(254), allowNull: false },
      subject: { type: DataTypes.STRING(255), allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued' },
      provider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'mailercloud' },
      provider_message_id: { type: DataTypes.STRING(120), allowNull: true },
      provider_response: { type: DataTypes.JSONB, allowNull: true },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      attempt: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
      /** BullMQ job id, so a log line can be traced back to a queue job. */
      job_id: { type: DataTypes.STRING(80), allowNull: true },
      scheduled_for: { type: DataTypes.DATE, allowNull: true },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('email_logs', ['application_id']);
    await queryInterface.addIndex('email_logs', ['template_key']);
    await queryInterface.addIndex('email_logs', ['status']);
    await queryInterface.addIndex('email_logs', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_logs');
  },
};
