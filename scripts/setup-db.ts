/**
 * setup-db.ts
 * Run with: npx ts-node scripts/setup-db.ts
 *
 * Creates all tables required by the Gympify Mobile BFF that do NOT already
 * exist in the central Doppa/Laravel database (coderstm_gympify).
 *
 * Safe to run multiple times — all statements use IF NOT EXISTS.
 */

import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_CONFIG = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  user: process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'coderstm_gympify',
  multipleStatements: true,
};

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  // ── Refresh Tokens ──────────────────────────────────────────────
  {
    name: 'refresh_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS \`refresh_tokens\` (
        \`id\`         BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
        \`user_id\`    VARCHAR(255)     NOT NULL,
        \`tenant_id\`  VARCHAR(100)     NOT NULL,
        \`token\`      VARCHAR(500)     NOT NULL,
        \`role\`       VARCHAR(50)      NOT NULL DEFAULT 'MEMBER',
        \`expires_at\` TIMESTAMP        NOT NULL,
        \`revoked_at\` TIMESTAMP        NULL,
        \`created_at\` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_refresh_token\` (\`token\`(255)),
        KEY \`idx_rt_user_tenant\` (\`user_id\`, \`tenant_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Password Resets (Laravel-compatible) ───────────────────────
  {
    name: 'password_resets',
    sql: `
      CREATE TABLE IF NOT EXISTS \`password_resets\` (
        \`email\`      VARCHAR(255) NOT NULL,
        \`token\`      VARCHAR(500) NOT NULL,
        \`created_at\` TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Check-ins ──────────────────────────────────────────────────
  {
    name: 'checkins',
    sql: `
      CREATE TABLE IF NOT EXISTS \`checkins\` (
        \`id\`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\`      VARCHAR(255)    NOT NULL,
        \`tenant_id\`    VARCHAR(100)    NOT NULL,
        \`type\`         ENUM('manual','qr','auto','admin') NOT NULL DEFAULT 'manual',
        \`notes\`        TEXT            NULL,
        \`checked_in_at\` TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`created_at\`   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_checkins_user_tenant\` (\`tenant_id\`, \`user_id\`),
        KEY \`idx_checkins_date\` (\`checked_in_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Class Schedules ────────────────────────────────────────────
  {
    name: 'class_schedules',
    sql: `
      CREATE TABLE IF NOT EXISTS \`class_schedules\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\`        VARCHAR(100)    NOT NULL,
        \`name\`             VARCHAR(255)    NOT NULL,
        \`description\`      TEXT            NULL,
        \`instructor\`       VARCHAR(255)    NULL,
        \`location\`         VARCHAR(255)    NULL,
        \`start_time\`       TIMESTAMP       NOT NULL,
        \`end_time\`         TIMESTAMP       NOT NULL,
        \`max_capacity\`     INT UNSIGNED    NOT NULL DEFAULT 20,
        \`current_bookings\` INT UNSIGNED    NOT NULL DEFAULT 0,
        \`is_active\`        TINYINT(1)      NOT NULL DEFAULT 1,
        \`color\`            VARCHAR(50)     NULL,
        \`created_at\`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_cs_tenant_active\` (\`tenant_id\`, \`is_active\`),
        KEY \`idx_cs_start_time\` (\`start_time\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Class Bookings ─────────────────────────────────────────────
  {
    name: 'class_bookings',
    sql: `
      CREATE TABLE IF NOT EXISTS \`class_bookings\` (
        \`id\`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\`           VARCHAR(255)    NOT NULL,
        \`tenant_id\`         VARCHAR(100)    NOT NULL,
        \`class_schedule_id\` BIGINT UNSIGNED NOT NULL,
        \`status\`            ENUM('confirmed','cancelled','pending','attended','no_show') NOT NULL DEFAULT 'confirmed',
        \`booked_at\`         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`cancelled_at\`      TIMESTAMP       NULL,
        \`cancel_reason\`     TEXT            NULL,
        \`created_at\`        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_cb_user_tenant\` (\`tenant_id\`, \`user_id\`),
        KEY \`idx_cb_schedule_status\` (\`class_schedule_id\`, \`status\`),
        CONSTRAINT \`fk_cb_schedule\` FOREIGN KEY (\`class_schedule_id\`)
          REFERENCES \`class_schedules\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Mobile Notifications ───────────────────────────────────────
  {
    name: 'mobile_notifications',
    sql: `
      CREATE TABLE IF NOT EXISTS \`mobile_notifications\` (
        \`id\`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\`    VARCHAR(255)    NOT NULL,
        \`tenant_id\`  VARCHAR(100)    NOT NULL,
        \`title\`      VARCHAR(255)    NOT NULL,
        \`message\`    TEXT            NOT NULL,
        \`type\`       ENUM('info','success','warning','alert','booking','payment','system') NOT NULL DEFAULT 'info',
        \`data\`       JSON            NULL,
        \`read_at\`    TIMESTAMP       NULL,
        \`created_at\` TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_notif_user_tenant_read\` (\`tenant_id\`, \`user_id\`, \`read_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Central Metrics ────────────────────────────────────────────
  {
    name: 'central_metrics',
    sql: `
      CREATE TABLE IF NOT EXISTS \`central_metrics\` (
        \`id\`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
        \`tenant_id\`   VARCHAR(50)     NOT NULL,
        \`metric_type\` VARCHAR(50)     NOT NULL,
        \`value\`       DECIMAL(12, 2)  NOT NULL DEFAULT 0,
        \`updated_at\`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_tenant_metric\` (\`tenant_id\`, \`metric_type\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
];

async function run() {
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log(`\n🔌 Connected to ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}\n`);

  let success = 0;
  let skipped = 0;

  for (const migration of MIGRATIONS) {
    try {
      await conn.query(migration.sql);
      const [rows] = await conn.query<any[]>(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE table_schema = ? AND table_name = ?`,
        [DB_CONFIG.database, migration.name],
      );
      if (rows[0].cnt > 0) {
        console.log(`  ✅  ${migration.name}`);
        success++;
      }
    } catch (err: any) {
      console.error(`  ❌  ${migration.name}: ${err.message}`);
      skipped++;
    }
  }

  await conn.end();
  console.log(`\n✔ Setup complete: ${success} tables ready, ${skipped} error(s).\n`);

  if (skipped > 0) process.exit(1);
}

run().catch(err => {
  console.error('Fatal error during DB setup:', err);
  process.exit(1);
});
