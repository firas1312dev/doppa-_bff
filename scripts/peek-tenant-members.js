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

  const tenantId = process.argv[2] || '9e19af49-55d2-4caf-904f-2956b60a9b60'; // strong / ines
  const [tenantRow] = await c.query('SELECT id, name, email, data FROM tenants WHERE id = ?', [tenantId]);
  const dbName = tenantRow[0]?.data?.tenancy_db_name;
  console.log('Tenant:', tenantRow[0]?.name, tenantId, 'owner:', tenantRow[0]?.email);
  console.log('DB:', dbName);

  const [central] = await c.query(`
    SELECT u.global_id, u.first_name, u.last_name, u.email
    FROM tenant_users tu INNER JOIN users u ON u.global_id = tu.global_user_id
    WHERE tu.tenant_id = ? AND u.deleted_at IS NULL
  `, [tenantId]);
  console.log('\nCentral tenant_users:', central.length, central);

  if (!dbName) { await c.end(); return; }

  const [tables] = await c.query(`SHOW TABLES FROM \`${dbName}\``);
  const names = tables.map((t) => Object.values(t)[0]);
  const memberTables = names.filter((n) => /member|user|customer/i.test(n));
  console.log('\nRelevant tables:', memberTables);

  for (const table of memberTables.slice(0, 8)) {
    try {
      const [rows] = await c.query(`SELECT * FROM \`${dbName}\`.\`${table}\` LIMIT 3`);
      console.log(`\n--- ${table} (${rows.length} sample) ---`);
      console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
      console.log(table, e.message);
    }
  }

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
