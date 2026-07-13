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
    FROM tenants t WHERE t.deleted_at IS NULL AND t.status = 'Active'
  `);

  for (const t of tenants) {
    const db = t.db_name;
    if (!db) continue;
    try {
      const [rows] = await c.query(`
        SELECT cs.id, cs.date_at, cs.start_at, cs.end_at, cs.start_of_week, cs.day,
               cs.is_active, cs.class_id, cs.deleted_at, cs.created_at,
               cl.name AS class_name, cl.deleted_at AS cl_deleted
        FROM \`${db}\`.class_schedules cs
        LEFT JOIN \`${db}\`.class_lists cl ON cl.id = cs.class_id
        ORDER BY cs.created_at DESC LIMIT 10
      `);
      if (rows.length === 0) continue;
      console.log(`\n======== ${t.name} (${t.id}) ========`);
      for (const r of rows) {
        const [test] = await c.query(`
          SELECT
            TIMESTAMP(?, ?) AS ts_combined,
            ? AS start_at_raw,
            ? AS date_at_raw
        `, [r.date_at, r.start_at, r.start_at, r.date_at]);
        console.log({
          id: r.id,
          class_name: r.class_name,
          date_at: r.date_at,
          start_at: r.start_at,
          start_of_week: r.start_of_week,
          is_active: r.is_active,
          deleted: !!r.deleted_at,
          cl_deleted: !!r.cl_deleted,
          ts_combined: test[0].ts_combined,
        });
      }
    } catch (e) {
      // skip
    }
  }

  await c.end();
})().catch(console.error);
