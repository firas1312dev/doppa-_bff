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
  const [t] = await c.query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
  const [tu] = await c.query('SELECT tu.*, u.email, u.first_name FROM tenant_users tu JOIN users u ON u.global_id = tu.global_user_id WHERE tu.tenant_id = ?', [tenantId]);
  const [owner] = await c.query('SELECT global_id, email, first_name, last_name, is_active FROM users WHERE email = ?', [t[0].email]);
  console.log('TENANT:', JSON.stringify(t[0], null, 2));
  console.log('OWNER_USER:', JSON.stringify(owner[0], null, 2));
  console.log('MEMBERS:', JSON.stringify(tu, null, 2));

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
