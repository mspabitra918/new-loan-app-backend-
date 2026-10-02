export default () => ({
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  appName: process.env.APP_NAME || "New Loans",
  publicWebUrl: process.env.PUBLIC_WEB_URL || "http://localhost:3000",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "ryer_loans",
    ssl: String(process.env.DB_SSL || "false") === "true",
  },

  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
  },

  crypto: {
    activeKeyId: process.env.ENCRYPTION_KEY_ACTIVE || "v1",
    keys: Object.keys(process.env)
      .filter((k) => k.startsWith("ENCRYPTION_KEY_V"))
      .reduce<Record<string, string>>((acc, k) => {
        acc[k.replace("ENCRYPTION_KEY_", "").toLowerCase()] = process.env[k];
        return acc;
      }, {}),
    blindIndexKey: process.env.BLIND_INDEX_KEY || "",
  },

  jwt: {
    secret: process.env.JWT_SECRET || "dev-only-secret",
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  },

  mail: {
    /**
     * Which sender to use: 'smtp' (nodemailer) or 'mailercloud' (HTTP API).
     * Defaults to SMTP whenever SMTP_HOST is configured, so setting the
     * SMTP_* block is enough to switch senders.
     */
    transport: (
      process.env.MAIL_TRANSPORT ||
      (process.env.SMTP_HOST ? "smtp" : "mailercloud")
    )
      .trim()
      .toLowerCase(),

    smtp: {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT || 587),
      // 465 is implicit TLS; 587 starts plaintext and upgrades with STARTTLS.
      secure:
        String(
          process.env.SMTP_SECURE ??
            Number(process.env.SMTP_PORT || 587) === 465,
        ) === "true",
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
      /** Accept a self-signed/mismatched cert. Development only. */
      allowInvalidCerts:
        String(process.env.SMTP_ALLOW_INVALID_CERTS || "false") === "true",
    },

    apiKey: process.env.MAILERCLOUD_API_KEY || "",
    apiUrl:
      process.env.MAILERCLOUD_API_URL || "https://cloudapi.mailercloud.com/v1",
    // FROM_EMAIL / FROM_NAME are the names the mailbox provider hands out;
    // MAIL_FROM_* stay supported so existing deployments keep working.
    fromEmail:
      process.env.FROM_EMAIL ||
      process.env.MAIL_FROM_EMAIL ||
      "no-reply@newloans.com",
    fromName:
      process.env.FROM_NAME || process.env.MAIL_FROM_NAME || "New Loans",
    replyTo:
      process.env.MAIL_REPLY_TO ||
      process.env.FROM_EMAIL ||
      process.env.MAIL_FROM_EMAIL ||
      "support@newloans.com",
    dryRun: String(process.env.MAIL_DRY_RUN || "true") === "true",
  },

  drip: {
    /**
     * The bank-verification drip: six emails, the first sent the moment
     * Step 3 is submitted and one every twelve hours after that, measured
     * in hours from the submission.
     *
     * The list is the schedule - add or remove offsets and the number of
     * rows written at Step 3 follows, capped at the number of templates.
     */
    bankOffsetHours: (process.env.DRIP_OFFSET_HOURS || "0,12,24,36,48,60")
      .split(",")
      .map((h) => Number(h.trim()))
      .filter((h) => Number.isFinite(h) && h >= 0),
    /** How often the drip runner looks for due rows, in seconds. */
    runnerIntervalSeconds: Number(
      process.env.DRIP_RUNNER_INTERVAL_SECONDS || 60,
    ),
    /** Rows picked up per runner tick. */
    runnerBatchSize: Number(process.env.DRIP_RUNNER_BATCH_SIZE || 25),
    /** Send attempts per row before it is marked failed for good. */
    maxAttempts: Number(process.env.DRIP_MAX_ATTEMPTS || 3),
    /** Wait before re-trying a row that failed for a retryable reason. */
    retryDelayMinutes: Number(process.env.DRIP_RETRY_DELAY_MINUTES || 15),
    resumeNudgeMinutes: Number(process.env.RESUME_NUDGE_MINUTES || 60),
  },

  policy: {
    declineLockoutDays: Number(process.env.DECLINE_LOCKOUT_DAYS || 90),
    affordabilityPtiMax: Number(process.env.AFFORDABILITY_PTI_MAX || 0.15),
    // Fixed product rate. Every quote uses this, capped by the state ceiling.
    defaultApr: Number(process.env.DEFAULT_APR || 10),
    resumeTokenTtlDays: Number(process.env.RESUME_TOKEN_TTL_DAYS || 30),
    purgeDeclinedAfterDays: Number(
      process.env.PURGE_DECLINED_AFTER_DAYS || 180,
    ),
    /**
     * Temporary: let every applicant reach Step 3 and submit their details.
     *
     * The rules engine still runs and still records why it would have
     * declined - the outcome is simply not allowed to stop anyone, and the
     * 90-day decline lockout is not enforced. Set
     * ALLOW_ALL_TO_FINAL_STEP=false to restore real decisioning.
     */
    allowAllToFinalStep:
      String(process.env.ALLOW_ALL_TO_FINAL_STEP ?? "true") === "true",
  },
});
