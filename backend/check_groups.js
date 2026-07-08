const { pool } = require('/app/backend/dist/db/pool.js');
pool.query('SELECT g.id, g.category_id, g.group_name, COUNT(bd.id) as bc FROM discipline_behavior_groups g JOIN discipline_behavior_details bd ON bd.group_id = g.id GROUP BY g.id, g.category_id, g.group_name ORDER BY g.id')
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); pool.end(); })
  .catch(e => { console.error('ERROR:', e.message); pool.end(); });