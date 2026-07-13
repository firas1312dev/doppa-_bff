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
  const [tables] = await c.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE '%instruct%' OR TABLE_NAME LIKE '%staff%' OR TABLE_NAME LIKE '%class%'`,
    [db],
  );
  console.log('tables:', tables.map((t) => t.TABLE_NAME));

  const [allTables] = await c.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
    [db],
  );
  console.log('all:', allTables.map((t) => t.TABLE_NAME).filter((n) => /class|book|loc|staff|instruct|schedule/i.test(n)));

  const [locs] = await c.query(`SELECT * FROM \`${db}\`.locations LIMIT 5`);
  console.log('locations:', locs);

  // users who might be instructors
  const [staff] = await c.query(`SELECT id, first_name, last_name, email, type FROM \`${db}\`.users WHERE type IS NOT NULL AND deleted_at IS NULL LIMIT 10`);
  console.log('users with type:', staff);

  await c.end();
})().catch(console.error);
