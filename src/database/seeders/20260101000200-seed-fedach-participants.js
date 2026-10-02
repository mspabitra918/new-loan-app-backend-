'use strict';

const path = require('path');

/**
 * Loads the FedACH participant subset that ships with the repo. The same JSON
 * file backs the runtime lookup service, so the seeded table and the in-memory
 * fallback can never disagree.
 *
 * In production, replace this seeder with the daily Federal Reserve feed
 * importer - the table schema is unchanged.
 */
const SAMPLE = require(path.resolve(__dirname, '..', '..', 'common', 'data', 'fedach-sample.json'));

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = Object.entries(SAMPLE).map(([routing_number, bank_name]) => ({
      routing_number,
      bank_name,
      is_receiving: true,
      created_at: now,
      updated_at: now,
    }));
    if (rows.length) {
      await queryInterface.bulkInsert('fedach_participants', rows, { ignoreDuplicates: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('fedach_participants', null, {});
  },
};
