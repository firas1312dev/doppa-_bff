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

  const db = 'tenant_9e19af49-55d2-4caf-904f-2956b60a9b60';
  const [tables] = await c.query(`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? AND (TABLE_NAME LIKE '%template%' OR TABLE_NAME LIKE '%schedule%')
    ORDER BY TABLE_NAME
  `, [db]);
  console.log('tables:', tables.map(t => t.TABLE_NAME));

  for (const { TABLE_NAME: table } of tables) {
    const [cnt] = await c.query(`SELECT COUNT(*) c FROM \`${db}\`.\`${table}\``);
    if (cnt[0].c > 0) {
      console.log(`\n${table} (${cnt[0].c} rows):`);
      const [rows] = await c.query(`SELECT * FROM \`${db}\`.\`${table}\` ORDER BY id DESC LIMIT 3`);
      console.log(JSON.stringify(rows, null, 2));
    }
  }

  // Recent class_lists (web might add course type only)
  const [lists] = await c.query(`
    SELECT id, name, created_at FROM \`${db}\`.class_lists
    WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5
  `);
  console.log('\nRecent class_lists:', lists);

  await c.end();
})().catch(console.error);
