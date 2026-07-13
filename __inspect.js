require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3307,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const q = async (sql) => (await conn.query(sql))[0];

  // 1. All tables
  const tables = (await q('SHOW TABLES')).map((r) => Object.values(r)[0]);
  console.log('=== TABLES (' + tables.length + ') ===');
  console.log(tables.join(', '));

  // 2. Look for admin/staff/role/permission related tables
  const interesting = tables.filter((t) =>
    /admin|staff|role|permission|model_has|member|user|tenant/i.test(t),
  );
  for (const t of interesting) {
    console.log('\n=== DESCRIBE ' + t + ' ===');
    const cols = await q('DESCRIBE `' + t + '`');
    cols.forEach((c) => console.log('  ' + c.Field + ' : ' + c.Type + (c.Key ? ' [' + c.Key + ']' : '')));
  }

  // 3. Sample admins + count (mask password hash prefix only)
  if (tables.includes('admins')) {
    const cnt = (await q('SELECT COUNT(*) AS c FROM admins'))[0].c;
    console.log('\n=== admins count: ' + cnt + ' ===');
    const rows = await q(
      "SELECT id, first_name, last_name, email, is_active, is_supper_admin, status, LEFT(password,7) AS pwd_prefix, deleted_at FROM admins LIMIT 10",
    );
    console.log(JSON.stringify(rows, null, 2));
  }

  await conn.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
