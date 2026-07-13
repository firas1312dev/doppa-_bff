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

  const tables = ['tenants', 'tenant_users', 'users', 'admins'];
  for (const t of tables) {
    const [cols] = await c.query(`SHOW COLUMNS FROM \`${t}\``);
    console.log(`\n=== ${t} ===`);
    cols.forEach((col) => console.log(`  ${col.Field} (${col.Type})`));
  }

  const [tenants] = await c.query(`
    SELECT id, name, email, identifier, status
    FROM tenants
    WHERE deleted_at IS NULL AND status = 'Active'
    ORDER BY name
    LIMIT 10
  `);
  console.log('\n=== SAMPLE TENANTS ===');
  console.log(JSON.stringify(tenants, null, 2));

  const [tu] = await c.query('SELECT * FROM tenant_users LIMIT 5');
  console.log('\n=== SAMPLE tenant_users ===');
  console.log(JSON.stringify(tu, null, 2));

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
