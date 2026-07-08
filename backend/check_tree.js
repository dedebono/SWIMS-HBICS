const { pool } = require('/app/backend/dist/db/pool.js');

// Get full handbook via DB queries (simulating getFullHandbook logic)
async function main() {
  const client = await pool.connect();
  try {
    // Get categories
    const cats = await client.query('SELECT * FROM discipline_categories ORDER BY id');
    
    // Get groups (DISTINCT like the service does)
    const groups = await client.query(`
      SELECT DISTINCT bg.* FROM discipline_behavior_groups bg
      JOIN discipline_categories bc ON bc.id = bg.category_id
      WHERE EXISTS (SELECT 1 FROM discipline_behavior_details bd WHERE bd.group_id = bg.id)
      ORDER BY bg.id
    `);
    
    // Get behaviors with levels
    const behaviors = await client.query(`
      SELECT bd.*, el.id as level_id, el.code as level_code, el.name as level_name
      FROM discipline_behavior_details bd
      JOIN discipline_behavior_groups bg ON bg.id = bd.group_id
      JOIN discipline_behavior_levels bl ON bl.behavior_id = bd.id
      JOIN discipline_education_levels el ON el.id = bl.level_id
      ORDER BY bd.group_id, bd.id
    `);
    
    // Build tree
    const groupsByCategory = new Map();
    for (const g of groups.rows) {
      if (!groupsByCategory.has(g.category_id)) groupsByCategory.set(g.category_id, []);
      groupsByCategory.get(g.category_id).push(g);
    }
    
    // Build behaviors by group
    const seenBehaviorIds = new Set();
    const behaviorsByGroup = new Map();
    for (const b of behaviors.rows) {
      if (seenBehaviorIds.has(b.id)) continue; // dedupe
      seenBehaviorIds.add(b.id);
      if (!behaviorsByGroup.has(b.group_id)) behaviorsByGroup.set(b.group_id, []);
      behaviorsByGroup.get(b.group_id).push(b);
    }
    
    // Build tree
    const tree = cats.rows.map(cat => {
      const catGroups = groupsByCategory.get(cat.id) ?? [];
      return {
        category: cat,
        groups: catGroups.map(g => ({
          ...g,
          behaviors: (behaviorsByGroup.get(g.id) ?? []).map(b => ({ id: b.id, group_id: b.group_id, behavior_text: b.behavior_text, levels: [{ id: b.level_id, code: b.level_code, name: b.level_name }] }))
        }))
      };
    });
    
    // Print tree structure for debugging
    for (const node of tree) {
      const keys = node.groups.map(g => `"${node.category.id}-group-${g.id}"`).join(', ');
      console.log(`Cat ${node.category.id} (${node.category.name}): [${keys}]`);
      if (node.groups.length > 0) {
        for (const g of node.groups) {
          const bkeys = g.behaviors.map(b => `"${node.category.id}-group-${g.id}-${b.id}"`).join(', ');
          console.log(`  Group ${g.id} (${g.group_name}): [${bkeys}]`);
        }
      }
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });