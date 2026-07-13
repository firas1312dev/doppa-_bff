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

  const [admins] = await c.query(
    'SELECT id, email, first_name, last_name, is_active FROM admins WHERE deleted_at IS NULL LIMIT 8',
  );
  console.log('ADMINS:', JSON.stringify(admins, null, 2));

  const [counts] = await c.query(`
    SELECT t.id, t.name, COUNT(tu.id) AS members
    FROM tenants t
    LEFT JOIN tenant_users tu ON tu.tenant_id = t.id
    WHERE t.status = 'Active'
    GROUP BY t.id, t.name
    HAVING members > 0
    ORDER BY members DESC
    LIMIT 8
  `);
  console.log('TENANTS_WITH_MEMBERS:', JSON.stringify(counts, null, 2));

  const [checkins] = await c.query('SELECT COUNT(*) AS cnt FROM checkins WHERE DATE(checked_in_at) = CURDATE()');
  console.log('CHECKINS_TODAY:', checkins[0]);

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
