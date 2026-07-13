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

  const [central] = await c.query(`
    SELECT tenant_id, COUNT(*) c FROM class_schedules GROUP BY tenant_id
  `);
  console.log('Central class_schedules by tenant:', central);

  const [recent] = await c.query(`
    SELECT id, tenant_id, name, start_time, is_active, created_at
    FROM class_schedules ORDER BY created_at DESC LIMIT 10
  `);
  console.log('Recent central:', recent);

  await c.end();
})().catch(console.error);
