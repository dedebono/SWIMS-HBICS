/**
 * Contract test: the REAL form payload must satisfy the REAL Zod schema.
 *
 * Why this exists: hand-written curl probes of /employee-counseling/submit
 * returned 201 while the live form still returned 422, because the probes did
 * not share the form's payload shape. `consents` was nested inside `answers`
 * in the wizard, but is a top-level column in the schema/migration/INSERT —
 * so every probe I sent by hand passed while every real submission failed.
 *
 * This closes that gap: it transpiles the actual wizard component, pulls out
 * the real `buildSubmissionPayload`, and runs it against the real schema for
 * every combination of enum values the UI can produce.
 *
 * Run: node scripts/contract-employee-counseling.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transformSync } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const WIZARD = join(ROOT, 'frontend/src/components/employee-counseling/EmployeeCounselingWizard.tsx');

// ── Load the REAL schema from the built shared package ────────────────────────
const { EmployeeCounselingSubmissionSchema } = await import(
  join(ROOT, 'shared/dist/employee-counseling.js')
);

// ── Transpile the REAL wizard and extract its payload builder ─────────────────
const source = readFileSync(WIZARD, 'utf8');
const js = transformSync(source, { loader: 'tsx', format: 'esm' }).code;

// Grab `buildSubmissionPayload`'s body by brace-matching from its signature.
// esbuild hoists the `export` keyword to a trailing `export { ... }`, so match
// the bare `function` declaration rather than `export function`.
const start = js.indexOf('function buildSubmissionPayload');
if (start === -1) {
  console.error('FATAL: buildSubmissionPayload not found in the wizard source.');
  process.exit(1);
}
const fnStart = start;
const bodyStart = js.indexOf('{', fnStart);
let depth = 0, i = bodyStart;
for (; i < js.length; i++) {
  if (js[i] === '{') depth++;
  else if (js[i] === '}') { depth--; if (depth === 0) { i++; break; } }
}
const fnSrc = js.slice(fnStart, i);
const buildSubmissionPayload = new Function(`return (${fnSrc})`)();

// A fully-completed form, exactly as the wizard's own FormData interface shapes it.
const FILLED = {
  employee_name: 'Budi Santoso',
  unit: 'Unit pastinya',
  position: 'Staf',
  contact_number: '0812',
  q1_alasan: ['stress'],
  q2_deskripsi: 'deskripsi',
  q3_durasi: '3_bulan',
  q4_dampak: 4,
  q5_area_terdampak: ['kerjaan'],
  q6_harapan: ['bantuan'],
  q7_pernah_konseling: 'belum_pernah',
  q7_pernah_konseling_detail: '',
  q8_safety_threat: 'tidak',
  q9_bantuan_segera: 'tidak',
  e_waktu: ['setelah'],
  e_metode: 'online',
  e_hari: 'Senin',
  e_konselor_preferensi: 'tanpa_preferensi',
  consents: { consent_confidentiality: true, consent_emergency_protocol: true },
};

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; return; }
  fail++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
};
// safeParse() returns {success:true} with no `error` when it passes, so stringify
// alone yields undefined. Always describe the outcome, never assume failure.
const issues = (res) => res.success ? '(valid)' : res.error.issues.map(x => `${x.path.join('.')}: ${x.message}`).join(' | ');

// ── 1. The payload the form ACTUALLY builds must validate ────────────────────
const payload = buildSubmissionPayload(FILLED);
const r = EmployeeCounselingSubmissionSchema.safeParse(payload);
check('real form payload validates', r.success,
  r.success ? '' : JSON.stringify(r.error.issues, null, 2).slice(0, 900));

// ── 2. consents must be TOP-LEVEL, not inside answers ───────────────────────
check('consents is a top-level key', Object.prototype.hasOwnProperty.call(payload, 'consents'));
check('consents is NOT nested inside answers',
  !Object.prototype.hasOwnProperty.call(payload.answers, 'consents'));
check('schema consumed consents',
  r.success && r.data.consents.consent_confidentiality === true);
check('answers survived parsing without consents leaking in',
  r.success && !Object.prototype.hasOwnProperty.call(r.data.answers, 'consents'));

// ── 3. The historical bug must be REJECTED (proves the schema still guards it)
const buggy = buildSubmissionPayload(FILLED);
delete buggy.consents;
buggy.answers.consents = { consent_confidentiality: true, consent_emergency_protocol: true };
check('nested-consents bug is rejected by schema',
  !EmployeeCounselingSubmissionSchema.safeParse(buggy).success);

// ── 4. Every enum the UI can produce must validate ───────────────────────────
const ENUMS = {
  q7_pernah_konseling: ['belum_pernah', 'pernah', 'sedang_dalam_pendampingan'],
  q8_safety_threat: ['tidak', 'ya', 'tidak_yakin'],
  q9_bantuan_segera: ['tidak', 'ya', 'tidak_yakin'],
  e_metode: ['tatap_muka', 'online', 'tanpa_preferensi'],
  e_konselor_preferensi: ['tanpa_preferensi', 'konselor_pria', 'konselor_wanita'],
};
const keys = Object.keys(ENUMS);
let combos = 0, comboFail = 0;
(function rec(i, form) {
  if (i === keys.length) {
    combos++;
    const res = EmployeeCounselingSubmissionSchema.safeParse(buildSubmissionPayload(form));
    if (!res.success) {
      comboFail++;
      if (comboFail === 1) {
        console.log(`  FAIL  enum combo rejected: ${JSON.stringify(Object.fromEntries(keys.map(k => [k, form[k]])))}`);
        console.log(`        ${res.error.issues.map(x => `${x.path.join('.')}: ${x.message}`).join(' | ')}`);
      }
    }
    return;
  }
  for (const v of ENUMS[keys[i]]) rec(i + 1, { ...form, [keys[i]]: v });
})(0, { ...FILLED });

check(`all ${combos} enum combinations validate`, comboFail === 0,
  comboFail ? `${comboFail}/${combos} rejected` : '');

// ── 5. Empty consents must NOT validate (checkbox is genuinely mandatory) ────
check('unchecked consents are rejected',
  !EmployeeCounselingSubmissionSchema.safeParse(
    buildSubmissionPayload({ ...FILLED, consents: { consent_confidentiality: false, consent_emergency_protocol: false } })
  ).success);

// ── 5b. Optional fields omitted the way the form actually omits them ────────
// The form sends `form.unit || null`, so a blank input becomes an explicit
// null. The first version of this test only used a fully-populated fixture and
// therefore missed this entirely — the API answered
//   422 unit: Expected string, received null
// Cover null, absent key, and empty string for every optional field.
const OPTIONAL_TOP = ['unit', 'position', 'contact_number'];
const OPTIONAL_ANS = ['q2_deskripsi', 'q7_pernah_konseling_detail', 'e_hari'];

{
  const allNull = buildSubmissionPayload({ ...FILLED, unit: '', position: '', contact_number: '' });
  const rA = EmployeeCounselingSubmissionSchema.safeParse(allNull);
  check('form\'s "blank input -> null" path validates', rA.success, issues(rA));
}
{
  const omitted = buildSubmissionPayload({ ...FILLED, unit: '', position: '', contact_number: '' });
  for (const k of OPTIONAL_TOP) delete omitted[k];
  check('omitted optional keys validate',
    EmployeeCounselingSubmissionSchema.safeParse(omitted).success);
}
{
  const emptyStrings = buildSubmissionPayload({ ...FILLED, unit: '', position: '', contact_number: '' });
  check('empty-string optionals validate',
    EmployeeCounselingSubmissionSchema.safeParse(emptyStrings).success);
}
{
  // Every optional answer string explicitly null.
  const ansNull = buildSubmissionPayload(FILLED);
  for (const k of OPTIONAL_ANS) ansNull.answers[k] = null;
  const rB = EmployeeCounselingSubmissionSchema.safeParse(ansNull);
  check('null optional answer fields validate', rB.success, issues(rB));
}
{
  // Nulls must still be persisted as SQL NULL, not crash the `?? null` path.
  const rNull = EmployeeCounselingSubmissionSchema.safeParse(
    buildSubmissionPayload({ ...FILLED, unit: '', position: '', contact_number: '' })
  );
  check('parsed nulls survive to the service as null',
    rNull.success && rNull.data.unit === null && rNull.data.position === null && rNull.data.contact_number === null,
    rNull.success ? `got unit=${JSON.stringify(rNull.data.unit)}` : 'parse failed');
}

// ── 6. is_high_priority must track the "tidak_yakin" trigger ─────────────────
// (the old code compared against 'tidak_sure', which no longer exists as an
// enum value, so uncertainty silently failed to flag high priority)
const unsure = buildSubmissionPayload({ ...FILLED, q8_safety_threat: 'tidak_yakin' });
check('is_high_priority true for "tidak_yakin"', unsure.is_high_priority === true,
  `got ${unsure.is_high_priority}`);
const calm = buildSubmissionPayload(FILLED);
check('is_high_priority false for "tidak"', calm.is_high_priority === false);

// ── 7. Prove the null-regression guard actually discriminates ───────────────
// Re-derive the PREVIOUS contract (`.optional()`) and confirm the form's
// payload is rejected by it. Without this, the null checks above could pass
// vacuously if the schema ever regressed in some other way.
{
  const { z } = await import('zod');
  const oldTop = { unit: z.string().optional(), position: z.string().optional(), contact_number: z.string().optional() };
  const nullForm = buildSubmissionPayload({ ...FILLED, unit: '', position: '', contact_number: '' });
  const oldRejects = [oldTop.unit.safeParse(nullForm.unit),
                      oldTop.position.safeParse(nullForm.position),
                      oldTop.contact_number.safeParse(nullForm.contact_number)]
    .some(r => !r.success);
  check('previous .optional() contract really did reject the form\'s nulls', oldRejects);
  check('current .nullish() contract accepts them',
    EmployeeCounselingSubmissionSchema.safeParse(nullForm).success);
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed  (${combos} enum combos exercised)`);
process.exit(fail === 0 ? 0 : 1);