require('dotenv').config();
const mysql = require('mysql2/promise');

const TENANT_ID = process.argv[2] || '9e19af49-55d2-4caf-904f-2956b60a9b60';

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const db = `tenant_${TENANT_ID}`;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  console.log('Now (UTC mysql fmt):', now);

  const [all] = await c.query(`
    SELECT cs.id, cs.day, cs.date_at, cs.start_at, cs.end_at, cs.class_id, cs.capacity,
           cs.is_active, cs.deleted_at, cs.created_at, cs.template_id, cs.instructor_id, cs.location_id,
           cl.name AS class_name
    FROM \`${db}\`.class_schedules cs
    LEFT JOIN \`${db}\`.class_lists cl ON cl.id = cs.class_id
    ORDER BY cs.id DESC
    LIMIT 20
  `);
  console.log('\n=== ALL class_schedules (latest 20) ===');
  console.log(JSON.stringify(all, null, 2));

  const [upcomingFilter] = await c.query(`
    SELECT cs.id, cl.name, cs.date_at, cs.start_at,
           TIMESTAMP(cs.date_at, cs.start_at) AS combined,
           TIMESTAMP(cs.date_at, cs.start_at) > ? AS is_upcoming
    FROM \`${db}\`.class_schedules cs
    LEFT JOIN \`${db}\`.class_lists cl ON cl.id = cs.class_id
    WHERE cs.deleted_at IS NULL
    ORDER BY cs.id DESC
  `, [now]);
  console.log('\n=== Upcoming filter check ===');
  console.log(JSON.stringify(upcomingFilter, null, 2));

  const [templates] = await c.query(`SELECT COUNT(*) c FROM \`${db}\`.template_schedules`);
  console.log('\ntemplate_schedules count:', templates[0].c);

  await c.end();
})().catch(console.error);
