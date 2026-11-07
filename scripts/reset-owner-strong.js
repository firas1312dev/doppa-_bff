require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const strongId = '9e19af49-55d2-4caf-904f-2956b60a9b60';
  const [t] = await c.query(`SELECT email FROM tenants WHERE id=?`, [strongId]);
  const ownerEmail = t[0]?.email;
  console.log('Owner email:', ownerEmail);

  const newPass = 'Owner1234';
  const hash = await bcrypt.hash(newPass, 10);

  const [u] = await c.query(`UPDATE users SET password=?, updated_at=NOW() WHERE LOWER(email)=?`, [hash, ownerEmail?.toLowerCase()]);
  console.log('central users updated:', u.affectedRows);
  const [a] = await c.query(`UPDATE admins SET password=?, updated_at=NOW() WHERE LOWER(email)=?`, [hash, ownerEmail?.toLowerCase()]).catch(() => [{ affectedRows: 0 }]);
  console.log('admins updated:', a.affectedRows);

  console.log('Owner password:', newPass);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
