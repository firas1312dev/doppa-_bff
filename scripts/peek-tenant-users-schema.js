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

  const tenantId = '07eabff1-d11f-4bec-93be-42027dadac50'; // leadergym
  const [trow] = await c.query(`SELECT data FROM tenants WHERE id = ?`, [tenantId]);
  let data = trow[0].data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = null; } }
  const dbName = data?.tenancy_db_name ?? `tenant_${tenantId}`;
  console.log('DB:', dbName);

  const [cols] = await c.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
     ORDER BY ORDINAL_POSITION`,
    [dbName],
  );
  console.log('USERS COLUMNS:');
  cols.forEach((c) => console.log(` - ${c.COLUMN_NAME} | ${c.COLUMN_TYPE} | null=${c.IS_NULLABLE} | def=${c.COLUMN_DEFAULT} | ${c.EXTRA}`));

  const [sample] = await c.query(`SELECT * FROM \`${dbName}\`.users WHERE deleted_at IS NULL LIMIT 2`);
  console.log('SAMPLE ROWS:', JSON.stringify(sample, null, 2));

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
