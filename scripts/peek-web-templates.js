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

  for (const table of ['week_templates', 'templates', 'template_schedules']) {
    console.log(`\n=== ${table} ===`);
    const [cols] = await c.query(`SHOW COLUMNS FROM \`${db}\`.\`${table}\``);
    console.log(cols.map(x => `${x.Field} (${x.Type})`).join(', '));
    const [rows] = await c.query(`SELECT * FROM \`${db}\`.\`${table}\` LIMIT 5`);
    console.log('rows:', JSON.stringify(rows, null, 2));
  }

  // class_lists without schedules
  const [orphan] = await c.query(`
    SELECT cl.id, cl.name, cl.created_at
    FROM \`${db}\`.class_lists cl
    LEFT JOIN \`${db}\`.class_schedules cs ON cs.class_id = cl.id AND cs.deleted_at IS NULL
    WHERE cl.deleted_at IS NULL AND cs.id IS NULL
    ORDER BY cl.created_at DESC LIMIT 10
  `);
  console.log('\nclass_lists WITHOUT any schedule:', orphan);

  await c.end();
})().catch(console.error);
