/**
 * sequelize-cli configuration.
 * Reads the same .env the Nest app uses so CLI and runtime never diverge.
 */
require('dotenv').config();

const base = {
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'ryer_loans',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  dialect: 'postgres',
  logging: false,
  define: {
    underscored: true,
    freezeTableName: false,
    timestamps: true,
  },
};

const ssl =
  String(process.env.DB_SSL || 'false') === 'true'
    ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } }
    : {};

module.exports = {
  development: { ...base, ...ssl },
  test: { ...base, database: `${base.database}_test`, ...ssl },
  production: { ...base, ...ssl, logging: false },
};
