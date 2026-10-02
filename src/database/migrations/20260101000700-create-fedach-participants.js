'use strict';

/**
 * FedACH participant file. Refreshed from the Federal Reserve daily feed.
 * Field 44 (bank name) is auto-populated from here and rendered read-only.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('fedach_participants', {
      routing_number: { type: DataTypes.STRING(9), primaryKey: true },
      bank_name: { type: DataTypes.STRING(120), allowNull: false },
      city: { type: DataTypes.STRING(60), allowNull: true },
      state: { type: DataTypes.STRING(2), allowNull: true },
      /** Receiver of ACH: 1 = receives, 2 = does not. */
      is_receiving: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('fedach_participants', ['bank_name']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fedach_participants');
  },
};
