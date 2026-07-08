const { pool } = require('/app/backend/dist/db/pool.js');
pool.query('SELECT * FROM tenants LIMIT 10')
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });