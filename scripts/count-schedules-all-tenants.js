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
    FROM tenants t WHERE t.deleted_at IS NULL
  `);

  for (const t of tenants) {
    const db = t.db_name;
    if (!db) continue;
    try {
      const [[sched], [lists], [tmpl]] = await Promise.all([
        c.query(`SELECT COUNT(*) c FROM \`${db}\`.class_schedules WHERE deleted_at IS NULL`),
        c.query(`SELECT COUNT(*) c FROM \`${db}\`.class_lists WHERE deleted_at IS NULL`),
        c.query(`SELECT COUNT(*) c FROM \`${db}\`.template_schedules`),
      ]);
      if (sched[0].c > 0 || tmpl[0].c > 0) {
        console.log(t.name, '| schedules:', sched[0].c, '| class_lists:', lists[0].c, '| templates:', tmpl[0].c);
      }
    } catch {}
  }

  await c.end();
})().catch(console.error);
