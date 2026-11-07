require('dotenv').config();
const mysql = require('mysql2/promise');

const digitsOnly = (col) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col},''),' ',''),'-',''),'+',''),'.','')`;

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const target = process.argv[2] || '20000002';

  // Central users
  const [central] = await c.query(
    `SELECT global_id, first_name, last_name, email, phone_number, is_active, status
     FROM users
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone_number,' ',''),'-',''),'+',''),'.','') LIKE ?
       AND deleted_at IS NULL`,
    [`%${target}%`],
  );
  console.log('CENTRAL MATCHES:', JSON.stringify(central, null, 2));

  // Strong tenant
  const strongId = '9e19af49-55d2-4caf-904f-2956b60a9b60';
  const dbName = `tenant_${strongId}`;
  try {
    const [rows] = await c.query(
      `SELECT id, member_id, first_name, last_name, email, phone_number, is_active, status, global_id
       FROM \`${dbName}\`.users
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone_number,' ',''),'-',''),'+',''),'.','') LIKE ?
         AND deleted_at IS NULL`,
      [`%${target}%`],
    );
    console.log(`\nSTRONG (${dbName}) MATCHES:`, JSON.stringify(rows, null, 2));
  } catch (e) {
    console.log('STRONG query error:', e.message);
  }

  // Which tenant(s) is this global_id linked to
  if (central.length) {
    for (const u of central) {
      const [links] = await c.query(
        `SELECT tu.tenant_id, t.name FROM tenant_users tu
         JOIN tenants t ON t.id = tu.tenant_id
         WHERE tu.global_user_id = ?`,
        [u.global_id],
      );
      console.log(`\nLINKS for ${u.email}:`, JSON.stringify(links, null, 2));
    }
  }

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
