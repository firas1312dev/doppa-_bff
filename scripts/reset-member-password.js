require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const globalId = '944893e0-f2bd-4806-a004-2a42040ff2e2';
  const newPassword = process.argv[2] || 'Test1234';
  const hash = await bcrypt.hash(newPassword, 10);

  // Central
  const [central] = await c.query(
    `UPDATE users SET password = ?, updated_at = NOW() WHERE global_id = ?`,
    [hash, globalId],
  );
  console.log('Central rows updated:', central.affectedRows);

  // Strong tenant
  const dbName = 'tenant_9e19af49-55d2-4caf-904f-2956b60a9b60';
  const [tenant] = await c.query(
    `UPDATE \`${dbName}\`.users SET password = ?, updated_at = NOW() WHERE global_id = ?`,
    [hash, globalId],
  );
  console.log('Strong tenant rows updated:', tenant.affectedRows);

  console.log(`\nDone. New password: ${newPassword}`);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
