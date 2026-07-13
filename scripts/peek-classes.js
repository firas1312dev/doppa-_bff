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
  const tenantId = '9e19af49-55d2-4caf-904f-2956b60a9b60';
  const db = `tenant_${tenantId}`;
  const [cols] = await c.query(`SHOW COLUMNS FROM \`${db}\`.class_schedules`);
  console.log('columns:', cols.map((x) => x.Field).join(', '));
  const [rows] = await c.query(`SELECT id, name, start_time, end_time, max_capacity FROM \`${db}\`.class_schedules WHERE deleted_at IS NULL LIMIT 5`);
  console.log('rows:', rows);
  await c.end();
})().catch(console.error);
