"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");

/**
 * Seeds one admin plus one example of each restricted role, so the RBAC rules
 * (closers and verification agents see last-4 only) can be exercised locally.
 * Only the admin password comes from .env; the rest get a random password and
 * must be reset before they are usable.
 */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const adminEmail = process.env.ADMIN_SEED_EMAIL || "admin@newloans.com";
    const adminPassword = process.env.ADMIN_SEED_PASSWORD || "ChangeMe!123";

    const unusable = () =>
      bcrypt.hashSync(require("crypto").randomBytes(24).toString("hex"), 10);

    await queryInterface.bulkInsert("admin_users", [
      {
        email: adminEmail.toLowerCase(),
        password_hash: bcrypt.hashSync(adminPassword, 12),
        full_name: "Platform Administrator",
        role: "admin",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        email: "compliance@newloans.com",
        password_hash: unusable(),
        full_name: "Compliance Officer",
        role: "compliance",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        email: "underwriter@newloans.com",
        password_hash: unusable(),
        full_name: "Senior Underwriter",
        role: "underwriter",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        email: "closer@newloans.com",
        password_hash: unusable(),
        full_name: "Call Centre Closer",
        role: "closer",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        email: "verification@newloans.com",
        password_hash: unusable(),
        full_name: "Verification Agent",
        role: "verification",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("admin_users", {
      email: {
        [Sequelize.Op.in]: [
          (process.env.ADMIN_SEED_EMAIL || "admin@newloans.com").toLowerCase(),
          "compliance@newloans.com",
          "underwriter@newloans.com",
          "closer@newloans.com",
          "verification@newloans.com",
        ],
      },
    });
  },
};
