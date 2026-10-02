'use strict';

/**
 * Every reveal of a masked field: who, when, which application, from which IP.
 * This table is append-only - there is no update or delete path in the app.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('sensitive_access_logs', {
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
      admin_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'admin_users', key: 'id' },
        onDelete: 'RESTRICT',
      },
      /** ssn | dl_number | account_number | routing_number */
      field_name: { type: DataTypes.STRING(30), allowNull: false },
      action: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'reveal' },
      reason: { type: DataTypes.STRING(200), allowNull: true },
      granted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.TEXT, allowNull: true },
      accessed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('sensitive_access_logs', ['application_id']);
    await queryInterface.addIndex('sensitive_access_logs', ['admin_user_id', 'accessed_at'], {
      name: 'sensitive_access_logs_user_time_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sensitive_access_logs');
  },
};
