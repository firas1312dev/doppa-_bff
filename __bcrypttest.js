const bcrypt = require('bcrypt');

(async () => {
  const pwd = 'Admin123!';
  const h2b = await bcrypt.hash(pwd, 10);
  const h2y = '$2y$' + h2b.slice(4); // same hash, Laravel-style version tag
  const h2a = '$2a$' + h2b.slice(4);

  console.log('hash $2b$ :', h2b);
  console.log('hash $2y$ :', h2y);
  console.log('compare correct vs $2b$ ->', await bcrypt.compare(pwd, h2b));
  console.log('compare correct vs $2y$ ->', await bcrypt.compare(pwd, h2y));
  console.log('compare correct vs $2a$ ->', await bcrypt.compare(pwd, h2a));
  console.log('compare wrong   vs $2y$ ->', await bcrypt.compare('nope', h2y));
})();
