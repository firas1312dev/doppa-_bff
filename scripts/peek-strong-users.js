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
  const dbName = 'tenant_9e19af49-55d2-4caf-904f-2956b60a9b60';

  const [all] = await c.query(`
    SELECT id, member_id, first_name, last_name, email, status, is_active, global_id, deleted_at
    FROM \`${dbName}\`.users
    ORDER BY created_at DESC
  `);
  console.log('ALL tenant users:', all.length);
  console.log(JSON.stringify(all, null, 2));

  const [owner] = await c.query('SELECT email FROM tenants WHERE id = ?', [tenantId]);
  console.log('Owner email:', owner[0].email);

  await c.end();
})();
