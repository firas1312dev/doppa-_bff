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

  const [gyms] = await c.query(`
    SELECT t.id AS tenant_id, t.name AS gym_name, t.status,
           (SELECT COUNT(*) FROM tenant_users tu WHERE tu.tenant_id = t.id) AS members
    FROM tenants t
    WHERE t.deleted_at IS NULL AND t.status = 'Active'
    ORDER BY t.name
    LIMIT 20
  `);
  console.log('ACTIVE_GYMS:', JSON.stringify(gyms, null, 2));

  // Check if sample test values are already taken
  const testEmail = 'membre.test@gympify.com';
  const testPhone = '20000001';
  const [emailTaken] = await c.query(
    `SELECT global_id, email FROM users WHERE email = ? AND deleted_at IS NULL`,
    [testEmail],
  );
  const [phoneTaken] = await c.query(
    `SELECT global_id, phone_number FROM users WHERE REPLACE(REPLACE(phone_number,' ',''),'+','') LIKE ? AND deleted_at IS NULL`,
    [`%${testPhone}%`],
  );
  console.log('TEST_EMAIL_TAKEN:', emailTaken.length ? emailTaken : 'FREE');
  console.log('TEST_PHONE_TAKEN:', phoneTaken.length ? phoneTaken : 'FREE');

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
