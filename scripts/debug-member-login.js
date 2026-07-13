require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  const normalized = hash.startsWith('$2y$') ? `$2b$${hash.slice(4)}` : hash;
  try {
    return await bcrypt.compare(plain, normalized);
  } catch {
    return false;
  }
}

(async () => {
  const email = process.argv[2] || 'issam.jemaa@gmail.com';
  const tenantId = process.argv[3] || '9e19af49-55d2-4caf-904f-2956b60a9b60';

  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  console.log('=== CENTRAL users ===');
  const [central] = await c.query(
    'SELECT global_id, email, first_name, is_active, LEFT(password,20) pw FROM users WHERE email = ?',
    [email],
  );
  console.log(central);

  console.log('\n=== tenant_users for tenant ===');
  if (central[0]) {
    const [tu] = await c.query(
      'SELECT * FROM tenant_users WHERE tenant_id = ? AND global_user_id = ?',
      [tenantId, central[0].global_id],
    );
    console.log(tu);
  } else {
    const [tu2] = await c.query(
      `SELECT tu.* FROM tenant_users tu
       INNER JOIN users u ON u.global_id = tu.global_user_id
       WHERE tu.tenant_id = ? AND u.email = ?`,
      [tenantId, email],
    );
    console.log('by email join:', tu2);
  }

  const [tenantRow] = await c.query('SELECT data FROM tenants WHERE id = ?', [tenantId]);
  const dbName = tenantRow[0]?.data?.tenancy_db_name || `tenant_${tenantId}`;

  console.log('\n=== TENANT DB users ===', dbName);
  try {
    const [tenantUser] = await c.query(
      `SELECT id, email, first_name, global_id, is_active, LEFT(password,20) pw FROM \`${dbName}\`.users WHERE email = ? AND deleted_at IS NULL`,
      [email],
    );
    console.log(tenantUser);
  } catch (e) {
    console.log(e.message);
  }

  await c.end();
})().catch(console.error);
