require('dotenv').config();
const mysql = require('mysql2/promise');

const TENANT_ID = '9e19af49-55d2-4caf-904f-2956b60a9b60';
const db = `tenant_${TENANT_ID}`;

const scheduleStartAtExpr = (alias = 'cs') => `CASE
  WHEN ${alias}.start_at REGEXP '^[0-9]{4}-' THEN CAST(${alias}.start_at AS DATETIME)
  WHEN ${alias}.date_at IS NOT NULL AND ${alias}.start_at IS NOT NULL AND ${alias}.start_at <> ''
    THEN TIMESTAMP(DATE(${alias}.date_at), TIME(STR_TO_DATE(${alias}.start_at, '%H:%i:%s')))
  WHEN ${alias}.date_at IS NOT NULL AND ${alias}.start_at IS NOT NULL
    THEN TIMESTAMP(DATE(${alias}.date_at), TIME(STR_TO_DATE(CONCAT(${alias}.start_at, ':00'), '%H:%i:%s')))
  ELSE ${alias}.date_at
END`;

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const startExpr = scheduleStartAtExpr('cs');

  const [upcoming] = await c.query(`
    SELECT cs.id, cl.name, ${startExpr} AS starts
    FROM \`${db}\`.class_schedules cs
    LEFT JOIN \`${db}\`.class_lists cl ON cl.id = cs.class_id AND cl.deleted_at IS NULL
    WHERE cs.deleted_at IS NULL AND COALESCE(cs.is_active, 1) = 1
      AND ${startExpr} IS NOT NULL AND ${startExpr} > NOW()
    ORDER BY ${startExpr} ASC
  `);
  console.log('Upcoming scheduled:', upcoming);

  const [unscheduled] = await c.query(`
    SELECT cl.id, cl.name FROM \`${db}\`.class_lists cl
    WHERE cl.deleted_at IS NULL AND COALESCE(cl.is_active, 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM \`${db}\`.class_schedules cs
        WHERE cs.class_id = cl.id AND cs.deleted_at IS NULL
      )
    ORDER BY cl.created_at DESC LIMIT 5
  `);
  console.log('Unscheduled (web catalog):', unscheduled);

  const [central] = await c.query(`
    SELECT id, name, start_time FROM class_schedules
    WHERE tenant_id = ? AND is_active = 1 AND start_time > NOW()
  `, [TENANT_ID]);
  console.log('Central upcoming:', central);

  await c.end();
})().catch(console.error);
