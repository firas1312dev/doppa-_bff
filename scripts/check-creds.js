const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  console.log('\n=== CREDENTIALS DE TEST (user + tenant) ===');
  const [rows] = await conn.query(`
    SELECT
      t.name        AS gym_name,
      t.id          AS tenant_id,
      u.email,
      u.first_name,
      u.last_name
    FROM tenant_users tu
    JOIN users u   ON u.global_id = tu.global_user_id
    JOIN tenants t ON t.id = tu.tenant_id
    WHERE t.status = 'Active'
      AND u.is_active = 1
    LIMIT 10
  `);
  console.table(rows);

  await conn.end();
})().catch(e => console.error('Erreur:', e.message));
