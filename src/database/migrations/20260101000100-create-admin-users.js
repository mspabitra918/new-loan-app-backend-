'use strict';

/**
 * Admin portal users. Role drives what sensitive data is visible:
 *  - agent / closer  -> last 4 only, never a reveal
 *  - underwriter     -> may reveal DL, never full SSN
 *  - compliance      -> may reveal full SSN and bank details (logged)
 *  - admin           -> everything, plus user management
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      email: { type: Sequelize.STRING(254), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      full_name: { type: Sequelize.STRING(120), allowNull: false },
      role: {
        type: Sequelize.ENUM('agent', 'closer', 'verification', 'underwriter', 'compliance', 'admin'),
        allowNull: false,
        defaultValue: 'agent',
      },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      last_login_at: { type: Sequelize.DATE, allowNull: true },
      last_login_ip: { type: Sequelize.INET, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('admin_users', ['role']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_users');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_admin_users_role";');
  },
};
