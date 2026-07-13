require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const [tenants] = await c.query(`
    SELECT t.id, t.name, JSON_UNQUOTE(JSON_EXTRACT(t.data, '$.tenancy_db_name')) AS db_name
    FROM tenants t
    WHERE t.deleted_at IS NULL AND t.status = 'Active'
      AND JSON_EXTRACT(t.data, '$.tenancy_db_name') IS NOT NULL
    LIMIT 50
  `);

  for (const t of tenants) {
    const db = t.db_name;
    if (!db) continue;
    try {
      const [sched] = await c.query(`SELECT COUNT(*) c FROM \`${db}\`.class_schedules WHERE deleted_at IS NULL`);
      const [book] = await c.query(`SELECT COUNT(*) c FROM \`${db}\`.bookings WHERE deleted_at IS NULL`);
      if (sched[0].c > 0 || book[0].c > 0) {
        console.log(t.name, t.id, 'schedules:', sched[0].c, 'bookings:', book[0].c);
        const [sample] = await c.query(`
          SELECT cs.id, cs.date_at, cs.start_at, cs.end_at, cs.capacity, cl.name
          FROM \`${db}\`.class_schedules cs
          LEFT JOIN \`${db}\`.class_lists cl ON cl.id = cs.class_id
          WHERE cs.deleted_at IS NULL LIMIT 2
        `);
        console.log(JSON.stringify(sample, null, 2));
      }
    } catch {}
  }

  // instructors / locations
  const db = 'tenant_9e19af49-55d2-4caf-904f-2956b60a9b60';
  for (const table of ['instructors', 'locations', 'users']) {
    try {
      const [cols] = await c.query(`SHOW COLUMNS FROM \`${db}\`.\`${table}\``);
      console.log(`\n${table}:`, cols.map((x) => x.Field).join(', '));
    } catch {}
  }

  await c.end();
})().catch(console.error);
