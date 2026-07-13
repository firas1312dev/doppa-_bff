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
  for (const table of ['class_schedules', 'class_lists', 'bookings', 'instructors']) {
    console.log(`\n=== ${table} ===`);
    const [cols] = await c.query(`SHOW COLUMNS FROM \`${db}\`.\`${table}\``);
    console.log(cols.map((x) => `${x.Field} (${x.Type})`).join('\n'));
    const [sample] = await c.query(`SELECT * FROM \`${db}\`.\`${table}\` LIMIT 1`);
    if (sample[0]) console.log('sample:', JSON.stringify(sample[0], null, 2));
  }

  // class_lists sample
  const [lists] = await c.query(`SELECT id, name, capacity, description FROM \`${db}\`.class_lists WHERE deleted_at IS NULL LIMIT 3`);
  console.log('\nclass_lists samples:', lists);

  await c.end();
})().catch(console.error);
