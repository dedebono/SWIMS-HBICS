/**
 * Verifikasi langsung service generateCaseSummary terhadap DB + LLM asli.
 * Dipakai untuk mengecek output ringkasan & saran, tanpa perlu login UI.
 */
import { generateCaseSummary } from './dist/services/ai-insights.service.js';

const [, , tenantId, caseId] = process.argv;

const insight = await generateCaseSummary(tenantId, caseId);
console.log('=== SUMMARY (disimpan ke kasus) ===');
console.log(insight.summary);
console.log('\n=== SECTIONS ===');
console.log(JSON.stringify(insight.sections, null, 2));
console.log('\n=== STATS ===');
console.log(JSON.stringify(insight.stats));
console.log('\n=== ACUAN BUKU PEDOMAN DISIPLIN ===');
console.log(
  JSON.stringify(
    {
      category: insight.reference.category_name,
      level: insight.reference.level_name,
      sop_count: insight.reference.sop.length,
      sanction_types: insight.reference.sanksi.map((s) => s.consequence_type),
    },
    null,
    2,
  ),
);
console.log('\n=== CONTOH SOP (3 pertama) ===');
console.log(insight.reference.sop.slice(0, 3).map((s) => `- [${s.target_type} ${s.step_number}] ${s.text}`).join('\n'));
console.log('\n=== CONTOH SANKSI (2 pertama) ===');
console.log(
  insight.reference.sanksi
    .slice(0, 2)
    .map((s) => `- ${s.consequence_type}: ${s.items.slice(0, 2).join('; ')}`)
    .join('\n'),
);
process.exit(0);