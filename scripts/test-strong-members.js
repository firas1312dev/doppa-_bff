require('dotenv').config();
const mysql = require('mysql2/promise');

const tenantId = '9e19af49-55d2-4caf-904f-2956b60a9b60';
const dbName = `tenant_${tenantId}`;
const ownerEmail = 'ines.trabelsi@gmail.com';

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const [rows] = await c.query(
    `SELECT id, member_id, first_name, last_name, email
     FROM \`${dbName}\`.users
     WHERE deleted_at IS NULL AND LOWER(email) <> ?
     ORDER BY created_at DESC`,
    [ownerEmail],
  );
  console.log('Tenant DB members (like mobile will show):', rows);
  await c.end();
})();
