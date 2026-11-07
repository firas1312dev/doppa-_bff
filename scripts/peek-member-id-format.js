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

  // find tenants whose users table has members
  const [tenants] = await c.query(
    `SELECT id, name, data FROM tenants WHERE deleted_at IS NULL AND status='Active'`,
  );
  for (const t of tenants) {
    let data = t.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = null; } }
    const dbName = data?.tenancy_db_name ?? `tenant_${t.id}`;
    try {
      const [rows] = await c.query(
        `SELECT id, member_id, name, first_name, last_name, email, type FROM \`${dbName}\`.users WHERE deleted_at IS NULL LIMIT 4`,
      );
      if (rows.length) {
        console.log(`\n=== ${t.name} (${dbName}) ===`);
        console.log(JSON.stringify(rows, null, 2));
      }
    } catch {}
  }
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
