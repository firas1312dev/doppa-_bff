require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const strongId = '9e19af49-55d2-4caf-904f-2956b60a9b60';
  const dbName = `tenant_${strongId}`;

  const [bill] = await c.query(`SELECT billing_address FROM tenants WHERE id = ?`, [strongId]);
  console.log('CENTRAL billing_address:', JSON.stringify(bill[0]?.billing_address, null, 2));

  for (const table of ['addresses', 'app_settings', 'shop_locations']) {
    try {
      const [cols] = await c.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
        [dbName, table]);
      console.log(`\n=== ${table} COLUMNS:`, cols.map(x => x.COLUMN_NAME).join(', '));
      const [rows] = await c.query(`SELECT * FROM \`${dbName}\`.\`${table}\` LIMIT 5`);
      console.log(`${table} ROWS:`, JSON.stringify(rows, null, 2));
    } catch (e) { console.log(table, 'err:', e.message); }
  }

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
