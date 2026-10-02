'use strict';

/** Append-only timeline shown on the admin application detail page. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('application_events', {
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
      event_type: { type: DataTypes.STRING(60), allowNull: false },
      /** Never contains SSN, DL, routing or account numbers. */
      payload: { type: DataTypes.JSONB, allowNull: true },
      actor_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'system' },
      actor_id: { type: DataTypes.UUID, allowNull: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('application_events', ['application_id', 'created_at'], {
      name: 'application_events_app_created_idx',
    });
    await queryInterface.addIndex('application_events', ['event_type']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('application_events');
  },
};
