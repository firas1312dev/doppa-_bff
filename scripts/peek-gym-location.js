require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const strongId = '9e19af49-55d2-4caf-904f-2956b60a9b60';

  // Central tenants row
  const [t] = await c.query(`SELECT * FROM tenants WHERE id = ?`, [strongId]);
  console.log('TENANT ROW KEYS:', Object.keys(t[0] || {}));
  console.log('TENANT data:', JSON.stringify(t[0]?.data, null, 2));

  const dbName = `tenant_${strongId}`;

  // locations table
  try {
    const [locCols] = await c.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=? AND TABLE_NAME='locations' ORDER BY ORDINAL_POSITION`, [dbName]);
    console.log('\nLOCATIONS COLUMNS:', locCols.map(x => x.COLUMN_NAME).join(', '));
    const [locs] = await c.query(`SELECT * FROM \`${dbName}\`.locations LIMIT 5`);
    console.log('LOCATIONS ROWS:', JSON.stringify(locs, null, 2));
  } catch (e) { console.log('locations err:', e.message); }

  // settings table (Laravel often stores gym address here)
  try {
    const [setCols] = await c.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=? AND TABLE_NAME='settings' ORDER BY ORDINAL_POSITION`, [dbName]);
    console.log('\nSETTINGS COLUMNS:', setCols.map(x => x.COLUMN_NAME).join(', '));
    const [sets] = await c.query(`SELECT * FROM \`${dbName}\`.settings LIMIT 30`);
    console.log('SETTINGS ROWS:', JSON.stringify(sets, null, 2));
  } catch (e) { console.log('settings err:', e.message); }

  // list tables that might hold address
  const [tables] = await c.query(`SHOW TABLES FROM \`${dbName}\``);
  const names = tables.map(t => Object.values(t)[0]);
  console.log('\nADDRESS-LIKE TABLES:', names.filter(n => /location|address|setting|branch|company|profile|gym|contact/i.test(n)));

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
