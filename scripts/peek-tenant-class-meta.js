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
  for (const table of ['instructor_class_lists', 'template_schedules', 'locations']) {
    console.log(`\n=== ${table} ===`);
    try {
      const [cols] = await c.query(`SHOW COLUMNS FROM \`${db}\`.\`${table}\``);
      console.log(cols.map((x) => `${x.Field} (${x.Type})`).join('\n'));
      const [rows] = await c.query(`SELECT * FROM \`${db}\`.\`${table}\` LIMIT 3`);
      console.log('rows:', rows);
    } catch (e) {
      console.log(e.message);
    }
  }

  // admins table in tenant?
  const [admins] = await c.query(`SHOW TABLES FROM \`${db}\` LIKE 'admins'`);
  if (admins.length) {
    const [a] = await c.query(`SELECT id, first_name, last_name, email FROM \`${db}\`.admins LIMIT 5`);
    console.log('admins:', a);
  }

  await c.end();
})().catch(console.error);
