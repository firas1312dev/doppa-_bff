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

  const [owners] = await c.query(`
    SELECT t.id AS tenant_id, t.name AS tenant_name, t.email AS tenant_email,
           u.global_id, u.first_name, u.last_name, u.email AS user_email,
           a.id AS admin_id, a.email AS admin_email
    FROM tenants t
    LEFT JOIN users u ON u.email = t.email AND u.deleted_at IS NULL
    LEFT JOIN admins a ON a.email = t.email AND a.deleted_at IS NULL
    WHERE t.deleted_at IS NULL AND t.status = 'Active'
    LIMIT 15
  `);
  console.log('TENANT_OWNER_MATCH:', JSON.stringify(owners, null, 2));

  const [ines] = await c.query(`
    SELECT 'user' AS type, global_id, email, first_name, last_name FROM users WHERE email LIKE '%ines%' OR first_name LIKE '%ines%'
    UNION
    SELECT 'admin', CAST(id AS CHAR), email, first_name, last_name FROM admins WHERE email LIKE '%ines%' OR first_name LIKE '%ines%'
    UNION
    SELECT 'tenant', id, email, name, '' FROM tenants WHERE email LIKE '%ines%' OR name LIKE '%ines%'
  `);
  console.log('INES:', JSON.stringify(ines, null, 2));

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
