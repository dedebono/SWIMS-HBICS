
import { queryWithTenant } from '../src/db/pool.js';
import { getActiveListForDomain } from '../src/services/quisioner-lists.service.js';
import { listQuestions } from '../src/services/quisioner.service.js';

async function main() {
  const { rows: ts } = await queryWithTenant('00000000-0000-0000-0000-000000000000', `SELECT tenant_id, slug FROM tenants ORDER BY slug`);
  for (const { tenant_id, slug } of ts) {
    console.log(`\n=== ${slug} ===`);
    for (const domain of ['student', 'staff'] as const) {
      const list = await getActiveListForDomain(tenant_id, domain);
      if (!list) { console.log(`  ${domain.padEnd(7)} -> (NO LIST)`); continue; }
      const qs = await listQuestions(tenant_id, list.question_list_id) as any[];
      const required = qs.filter(q => q.is_required).length;
      console.log(`  ${domain.padEnd(7)} -> "${list.name}" | targets=${JSON.stringify(list.targets)} | questions=${qs.length} (required ${required})`);
      const ids = new Set(qs.map(q => q.question_id));
      // Cross-contamination check
      const { rows: foreign } = await queryWithTenant(tenant_id,
        `SELECT l.name, count(*) FROM quisioner_questions q JOIN quisioner_question_lists l ON l.question_list_id=q.question_list_id WHERE q.tenant_id=$1 AND q.deleted_at IS NULL AND NOT (q.question_list_id = ANY($2::uuid[])) GROUP BY l.name`, [tenant_id, [...ids]]);
      console.log(`            NOT leaked: ${JSON.stringify(foreign)}`);
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
