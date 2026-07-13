/**
 * Insère un cours test dans la base tenant (visible web + mobile).
 * Usage: node scripts/seed-tenant-class.js [tenantId]
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const TENANT_ID = process.argv[2] || '9e19af49-55d2-4caf-904f-2956b60a9b60';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const [tenants] = await c.query(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.tenancy_db_name')) AS db_name, name FROM tenants WHERE id = ?`,
    [TENANT_ID],
  );
  const db = tenants[0]?.db_name || `tenant_${TENANT_ID}`;
  console.log('Gym:', tenants[0]?.name, '| DB:', db);

  const [lists] = await c.query(
    `SELECT id, name, capacity FROM \`${db}\`.class_lists WHERE deleted_at IS NULL LIMIT 1`,
  );
  if (!lists[0]) {
    console.error('Aucun class_list trouvé.');
    process.exit(1);
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const end = new Date(tomorrow);
  end.setHours(11, 0, 0, 0);

  const dateStr = tomorrow.toISOString().slice(0, 10);
  const startAt = '10:00:00';
  const endAt = '11:00:00';
  const day = DAYS[tomorrow.getDay()];

  const [result] = await c.query(
    `INSERT INTO \`${db}\`.class_schedules
       (day, date_at, start_at, end_at, class_id, capacity, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
    [day, dateStr, startAt, endAt, lists[0].id, lists[0].capacity || 10],
  );

  console.log('Cours créé:', {
    scheduleId: result.insertId,
    className: lists[0].name,
    date: dateStr,
    time: `${startAt} - ${endAt}`,
  });

  const [count] = await c.query(
    `SELECT COUNT(*) c FROM \`${db}\`.class_schedules WHERE deleted_at IS NULL`,
  );
  console.log('Total class_schedules:', count[0].c);

  await c.end();
})().catch(console.error);
