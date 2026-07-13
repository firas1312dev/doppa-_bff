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

  const tenantId = '2ef3ae8e-1e86-4f27-b24f-180b550594e8'; // CAgym with 6 members in tenant_users

  const [central] = await c.query(`
    SELECT u.global_id, u.first_name, u.last_name, u.email, u.deleted_at
    FROM tenant_users tu
    INNER JOIN users u ON u.global_id = tu.global_user_id
    WHERE tu.tenant_id = ?
  `, [tenantId]);
  console.log('CENTRAL tenant_users members:', central.length);
  console.log(JSON.stringify(central, null, 2));

  const [tenantRow] = await c.query('SELECT data FROM tenants WHERE id = ?', [tenantId]);
  const dbName = tenantRow[0]?.data?.tenancy_db_name;
  console.log('\nTENANT DB:', dbName);

  if (dbName) {
    try {
      const [tenantMembers] = await c.query(`
        SELECT id, first_name, last_name, email, status, deleted_at
        FROM \`${dbName}\`.users
        WHERE deleted_at IS NULL
        LIMIT 20
      `);
      console.log('\nTENANT DB users count sample:', tenantMembers.length);
      console.log(JSON.stringify(tenantMembers, null, 2));
    } catch (e) {
      console.log('Tenant DB error:', e.message);
    }
  }

  // Check if members table exists in tenant db
  if (dbName) {
    try {
      const [tables] = await c.query(`SHOW TABLES FROM \`${dbName}\` LIKE '%member%'`);
      console.log('\nMember-like tables:', tables);
      const [allTables] = await c.query(`SHOW TABLES FROM \`${dbName}\``);
      console.log('All tenant tables:', allTables.map(t => Object.values(t)[0]).slice(0, 30));
    } catch (e) {
      console.log(e.message);
    }
  }

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
