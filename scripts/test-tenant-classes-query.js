require('dotenv').config();
const mysql = require('mysql2/promise');

const TENANT_ID = '9e19af49-55d2-4caf-904f-2956b60a9b60';

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const db = `tenant_${TENANT_ID}`;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const [rows] = await c.query(`
    SELECT cs.id, cl.name AS class_name, cs.date_at, cs.start_at, cs.end_at, cs.capacity,
      (SELECT COUNT(*) FROM \`${db}\`.bookings b WHERE b.schedule_id = cs.id AND b.deleted_at IS NULL AND b.canceled_at IS NULL) AS bookings
    FROM \`${db}\`.class_schedules cs
    LEFT JOIN \`${db}\`.class_lists cl ON cl.id = cs.class_id
    WHERE cs.deleted_at IS NULL AND cs.is_active = 1 AND TIMESTAMP(cs.date_at, cs.start_at) > ?
  `, [now]);

  console.log('Upcoming tenant classes:', JSON.stringify(rows, null, 2));
  await c.end();
})().catch(console.error);
