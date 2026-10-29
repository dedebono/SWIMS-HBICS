import { getClientWithTenant, queryWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';
import { getAiSettings } from './tenant-settings.service.js';

/**
 * Ringkasan Otomatis + Saran Guru
 * ---------------------------------
 * Guru menekan "Buat Ringkasan", lalu AI membaca SELURUH detail kasus —
 * insiden, intervensi, log komunikasi orang tua, dan observasi positif —
 * ditambah SOP + SANKSI dari Buku Pedoman Disiplin. Output-nya bahasa
 * Indonesia yang sederhana (tanpa jargon), plus saran konkret untuk guru.
 *
 * Connor Theater: The LLM is asked for ONE plain-text block with fixed
 * section markers. We parse those markers into `sections` for the rich UI,
 * but `summary` keeps the whole text so older callers (head dashboard,
 * confirm flow, DB storage) keep working unchanged.
 */

// ─── Label Bahasa Indonesia ──────────────────────────────────────────────────

const CASE_TYPE_LABEL: Record<string, string> = {
  BEHAVIORAL: 'Perilaku',
  EMOTIONAL: 'Emosional / kesehatan jiwa',
  MEDICAL: 'Medis',
  ACADEMIC: 'Akademik',
  POSITIVE: 'Perilaku positif',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Terbuka — masih berjalan',
  MONITORING: 'Dipantau — gothic lanjut',
  CLOSED: 'Ditutup',
};

const SEVERITY_LABEL: Record<string, string> = {
  LOW: 'rendah',
  MEDIUM: 'sedang',
  HIGH: 'tinggi',
  CRITICAL: 'kritis',
};

const CHANNEL_LABEL: Record<string, string> = {
  PHONE: 'telepon',
  EMAIL: 'email',
  IN_PERSON: 'tatap muka',
  APP: 'aplikasi',
  WHATSAPP: 'WhatsApp',
};

/** Markers the model is asked to emit. Parsed back out into `sections`. */
export const SUMMARY_SECTIONS = [
  { key: 'terjadi', marker: 'APA YANG TERJADI', icon: 'incident' },
  { key: 'sudah_dilakukan', marker: 'YANG SUDAH DILAKUKAN', icon: 'done' },
  { key: 'komunikasi', marker: 'KOMUNIKASI', icon: 'comms' },
  { key: 'posisi', marker: 'SUDAH SAMPAI MANA', icon: 'progress' },
  { key: 'saran', marker: 'SARAN UNTUK GURU', icon: 'advice' },
] as const;

export type SummarySectionKey = (typeof SUMMARY_SECTIONS)[number]['key'];

export interface CaseAiReference {
  category_id: number | null;
  category_name: string | null;
  level_id: number | null;
  level_name: string | null;
  /** SOP penanganan (discipline_handling_guidelines), already trimmed. */
  sop: Array<{ target_type: string; step_number: number; text: string }>;
  /** SANKSI / konsekuensi (discipline_consequence_guidelines), grouped. */
  sanksi: Array<{ consequence_type: string; items: string[] }>;
}

export interface CaseAiInsight {
  /** Full plain-text ringkasan — what gets stored on the case. */
  summary: string;
  /** Parsed sections for the rich UI; empty strings when the model didn't split. */
  sections: Record<SummarySectionKey, string>;
  reference: CaseAiReference;
  stats: {
    incidents: number;
    interventions_done: number;
    interventions_total: number;
    communications: number;
    observations: number;
    days_open: number | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clip(text: unknown, max = 320): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function idDate(value: unknown): string {
  if (!value) return 'tanggal tidak tercatat';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return 'tanggal tidak tercatat';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "Grade 8" → SMP-SMA, "Grade 3" → SD, "TK" → KB-TK … */
export function mapPhaseToLevelId(phase: string | null | undefined): number | null {
  if (!phase) return null;
  const p = String(phase).trim().toLowerCase();
  const grade = p.match(/grade\s*(\d{1,2})|kelas\s*(\d{1,2})/);
  if (grade) {
    const g = Number(grade[1] ?? grade[2]);
    if (g >= 1 && g <= 6) return 2; // SD
    if (g >= 7) return 3; // SMP-SMA
  }
  if (/(^|\b)(tk|kb|taman kanak|play group|kelompok bermain)/.test(p)) return 1;
  if (/(^|\b)(smp|sma|sekolah menengah)/.test(p)) return 3;
  if (/(^|\b)(sd|sekolah dasar|primary)/.test(p)) return 2;
  return null;
}

/** Risiko / kategori insiden → tingkat pelanggaran Buku Pedoman Disiplin. */
export function mapRiskToCategoryId(risk: string | null | undefined): number {
  switch ((risk ?? '').toUpperCase()) {
    case 'CRITICAL':
      return 4;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    default:
      return 1;
  }
}

// ─── Konteks kasus ───────────────────────────────────────────────────────────

interface CaseContext {
  caseRow: any;
  studentName: string;
  incidents: any[];
  interventions: any[];
  communications: any[];
  observations: any[];
  levelId: number | null;
  enrollmentLevelId: number | null;
}

async function loadCaseContext(tenantId: string, caseId: string, client: any): Promise<CaseContext> {
  const { rows: caseRows } = await client.query(
    `SELECT c.case_id, c.case_type, c.status, c.risk_level, c.risk_level_source,
            c.opened_date, c.closed_date, c.school_phase_ref, c.summary,
            s.full_name AS student_name
       FROM cases c
       JOIN students s ON s.student_id = c.student_id
      WHERE c.case_id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL`,
    [caseId, tenantId],
  );
  if (caseRows.length === 0) throw new Error('Case not found');
  const caseRow = caseRows[0];

  const [incidents, interventions, communications, observations, enrollment] = await Promise.all([
    client.query(
      `SELECT category, sub_category, severity, description, location, incident_at, immediate_actions
         FROM incidents
        WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        ORDER BY incident_at ASC`,
      [caseId, tenantId],
    ),
    client.query(
      `SELECT type, description, scheduled_at, completed_at, outcome, effectiveness
         FROM interventions
        WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [caseId, tenantId],
    ),
    client.query(
      `SELECT channel, contact_name, contact_role, message, created_at
         FROM case_communications
        WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [caseId, tenantId],
    ),
    client.query(
      `SELECT category, description, observed_at
         FROM positive_observations
        WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        ORDER BY observed_at DESC LIMIT 5`,
      [caseId, tenantId],
    ),
    client.query(
      `SELECT school_level FROM student_enrollment_history
        WHERE student_id = $1 AND tenant_id = $2
        ORDER BY enrolled_at DESC LIMIT 1`,
      [caseRow.student_id, tenantId],
    ),
  ]);

  const enrollmentLevelId =
    enrollment.rows[0]?.school_level === 'PRESCHOOL'
      ? 1
      : enrollment.rows[0]?.school_level === 'PRIMARY'
        ? 2
        : enrollment.rows[0]?.school_level
          ? 3
          : null;

  return {
    caseRow,
    studentName: String(caseRow.student_name ?? 'Siswa'),
    incidents: incidents.rows,
    interventions: interventions.rows,
    communications: communications.rows,
    observations: observations.rows,
    levelId: mapPhaseToLevelId(caseRow.school_phase_ref),
    enrollmentLevelId,
  };
}

/** Blok teks fakta yang dikirim ke AI — semua Bahasa Indonesia, sudah dipangkas. */
function buildFactSheet(ctx: CaseContext): { facts: string; daysOpen: number | null } {
  const { caseRow } = ctx;
  const lines: string[] = [];

  lines.push(`DATA KASUS`);
  // Nama sengaja tidak dikirim: output dipakai untuk laporan sederhana dan
  // tidak boleh menyebut nama lengkap siswa.
  lines.push('- Nama siswa: tidak disebutkan (gunakan kata "siswa")');
  lines.push(`- Jenis kasus: ${CASE_TYPE_LABEL[caseRow.case_type] ?? caseRow.case_type}`);
  lines.push(`- Status kasus: ${STATUS_LABEL[caseRow.status] ?? caseRow.status}`);
  lines.push(
    `- Tingkat risiko: ${SEVERITY_LABEL[caseRow.risk_level] ?? caseRow.risk_level} (${caseRow.risk_level_source === 'AUTO' ? 'dihitung sistem' : 'ditentukan guru'})`,
  );
  lines.push(`- Kelas/tingkat: ${caseRow.school_phase_ref ?? 'tidak tercatat'}`);
  lines.push(`- Kasus dibuka: ${idDate(caseRow.opened_date)}`);
  if (caseRow.closed_date) lines.push(`- Kasus ditutup: ${idDate(caseRow.closed_date)}`);

  let daysOpen: number | null = null;
  if (caseRow.opened_date) {
    const opened = new Date(String(caseRow.opened_date));
    if (!Number.isNaN(opened.getTime())) {
      const end = caseRow.closed_date ? new Date(String(caseRow.closed_date)) : new Date();
      daysOpen = Math.max(0, Math.round((end.getTime() - opened.getTime()) / 86_400_000));
      lines.push(`- Usia kasus: ${daysOpen} hari${caseRow.closed_date ? '' : ' (masih berjalan)'}`);
    }
  }

  lines.push('', `IN SIDEN TERDAFTAR (${ctx.incidents.length})`);
  if (ctx.incidents.length === 0) {
    lines.push('- (belum ada insiden yang tercatat di kasus ini)');
  }
  ctx.incidents.forEach((inc, i) => {
    lines.push(
      `${i + 1}. ${idDate(inc.incident_at)} — kategori: ${inc.category ?? 'tidak tercatat'}${inc.sub_category ? ` / ${inc.sub_category}` : ''}, tingkat: ${SEVERITY_LABEL[inc.severity] ?? inc.severity}${inc.location ? `, lokasi: ${inc.location}` : ''}`,
    );
    lines.push(`   Kronologi: ${clip(inc.description, 600)}`);
    if (inc.immediate_actions) lines.push(`   Tindakan langsung saat itu: ${clip(inc.immediate_actions, 300)}`);
  });

  const done = ctx.interventions.filter((i) => i.completed_at);
  lines.push('', `INTERVENSI / TINDAKAN (${done.length} selesai dari ${ctx.interventions.length})`);
  if (ctx.interventions.length === 0) {
    lines.push('- (belum ada intervensi yang tercatat)');
  }
  ctx.interventions.forEach((iv, i) => {
    const status = iv.completed_at ? `selesai ${idDate(iv.completed_at)}` : iv.scheduled_at ? `dijadwalkan ${idDate(iv.scheduled_at)}` : 'belum dikerjakan';
    const score = iv.effectiveness ? `, nilai ${iv.effectiveness}/5` : '';
    lines.push(`${i + 1}. ${iv.type} — ${status}${score}`);
    lines.push(`   Isi: ${clip(iv.description, 300)}`);
    if (iv.outcome) lines.push(`   Hasil: ${clip(iv.outcome, 300)}`);
  });

  lines.push('', `KOMUNIKASI DENGAN ORANG TUA (${ctx.communications.length} kali)`);
  if (ctx.communications.length === 0) {
    lines.push('- (belum ada komunikasi dengan orang tua/wali yang tercatat)');
  }
  ctx.communications.forEach((c, i) => {
    lines.push(
      `${i + 1}. ${idDate(c.created_at)} via ${CHANNEL_LABEL[String(c.channel ?? '').toUpperCase()] ?? c.channel ?? 'tidak diketahui'} — ${c.contact_name ?? 'tanpa nama'}${c.contact_role ? ` (${c.contact_role})` : ''}`,
    );
    lines.push(`   Isi: ${clip(c.message, 400)}`);
  });

  if (ctx.observations.length > 0) {
    lines.push('', `CATATAN PERILAKU POSITIF (${ctx.observations.length})`);
    ctx.observations.forEach((o, i) => {
      lines.push(`${i + 1}. ${idDate(o.observed_at)} — ${o.category}: ${clip(o.description, 200)}`);
    });
  }

  return { facts: lines.join('\n'), daysOpen };
}

// ─── Buku Pedoman Disiplin: SOP + SANKSI ─────────────────────────────────────

async function loadHandbookReference(
  ctx: CaseContext,
  categoryId: number,
  levelId: number | null,
): Promise<CaseAiReference> {
  const categories = await queryWithTenant<{ id: number; name: string }>(
    ctx.caseRow.tenant_id,
    `SELECT id, name FROM discipline_categories ORDER BY id`,
  );
  const category = categories.rows.find((c) => c.id === categoryId) ?? categories.rows[0];

  const levels = await queryWithTenant<{ id: number; name: string }>(
    ctx.caseRow.tenant_id,
    `SELECT id, name FROM discipline_education_levels ORDER BY sort_order`,
  );
  const level =
    levels.rows.find((l) => l.id === levelId) ??
    levels.rows.find((l) => l.id === ctx.enrollmentLevelId) ??
    levels.rows[levels.rows.length - 1];

  const effectiveLevelId = level?.id ?? null;

  const [sopRows, sanctionRows] = await Promise.all([
    queryWithTenant<{ target_type: string; step_number: number; guideline_text: string }>(
      ctx.caseRow.tenant_id,
      effectiveLevelId
        ? `SELECT target_type, step_number, guideline_text
             FROM discipline_handling_guidelines
            WHERE category_id = $1 AND level_id = $2
            ORDER BY step_number ASC LIMIT 24`
        : `SELECT target_type, step_number, guideline_text
             FROM discipline_handling_guidelines
            WHERE category_id = $1
            ORDER BY step_number ASC LIMIT 24`,
      effectiveLevelId ? [categoryId, effectiveLevelId] : [categoryId],
    ),
    queryWithTenant<{ consequence_type: string; consequence_text: string }>(
      ctx.caseRow.tenant_id,
      effectiveLevelId
        ? `SELECT consequence_type, consequence_text
             FROM discipline_consequence_guidelines
            WHERE category_id = $1 AND level_id = $2
            ORDER BY consequence_type LIMIT 20`
        : `SELECT consequence_type, consequence_text
             FROM discipline_consequence_guidelines
            WHERE category_id = $1
            ORDER BY consequence_type LIMIT 20`,
      effectiveLevelId ? [categoryId, effectiveLevelId] : [categoryId],
    ),
  ]);

  const sanctionsByType = new Map<string, string[]>();
  for (const row of sanctionRows.rows) {
    const list = sanctionsByType.get(row.consequence_type) ?? [];
    list.push(clip(row.consequence_text, 220));
    sanctionsByType.set(row.consequence_type, list);
  }

  const sanksi = Array.from(sanctionsByType.entries()).map(([consequence_type, items]) => ({
    consequence_type,
    items: items.slice(0, 5),
  }));

  return {
    category_id: category?.id ?? null,
    category_name: category?.name ?? null,
    level_id: effectiveLevelId,
    level_name: level?.name ?? null,
    sop: sopRows.rows.map((r) => ({
      target_type: r.target_type,
      step_number: r.step_number,
      text: clip(r.guideline_text, 320),
    })),
    sanksi,
  };
}

function renderHandbook(reference: CaseAiReference): string {
  if (reference.sop.length === 0 && reference.sanksi.length === 0) {
    return '(Buku Pedoman Disiplin belum diisi untuk tingkat & jenjang kasus ini.)';
  }
  const out: string[] = [];
  out.push(
    `Kategori pelanggaran: ${reference.category_name ?? 'tidak terpetakan'} | Jenjang: ${reference.level_name ?? 'tidak terpetakan'}`,
  );
  if (reference.sop.length > 0) {
    out.push('', 'SOP PENANGANAN (dari Buku Pedoman Disiplin):');
    for (const step of reference.sop) {
      out.push(`- [${step.target_type} langkah ${step.step_number}] ${step.text}`);
    }
  }
  if (reference.sanksi.length > 0) {
    out.push('', 'SANKSI / KONSEKUENSI (dari Buku Pedoman Disiplin):');
    for (const group of reference.sanksi) {
      out.push(`- ${group.consequence_type}: ${group.items.join('; ')}`);
    }
  }
  return out.join('\n');
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildPrompt(facts: string, handbook: string): string {
  return [
    'Kamu adalah guru BK yang sudah berpengalaman. Tugasmu menulis ringkasan kasus untuk guru lain.',
    '',
    'ATURAN BAHASA (WAJIB DIPATUHI):',
    '1. 100% Bahasa Indonesia. JANGAN memakai kata bahasa Inggris (mis. receiving,',
    '   follow up, monitoring, update, handling). Ganti dengan kata Indonesia.',
    '2. Kalimat pendek dan sederhana, mudah dipahami orang tua.',
    '3. Jangan menghakimi dan jangan menebak fakta yang tidak ada di data.',
    '4. Pakai kata "siswa", "guru", "sekolah". Jangan tulis nama lengkap siswa.',
    '5. Ringkas: maksimal 2 kalimat per bagian, maksimal 4 butir saran.',
    '6. JANGAN memakai markdown: tanpa tanda #, tanpa **tebal**, tanpa garis pemisah (---),',
    '   tanpa tabel, tanpa nomor Romawi, tanpa emoji.',
    '7. JANGAN menulis judul, ringkasan awal, atau penutup. Langsung mulai dari',
    '   judul bagian pertama yang diminta.',
    '8. Hanya gunakan huruf Latin, angka, dan tanda baca biasa. JANGAN menyisipkan',
    '   huruf dari bahasa lain di dalam kata Indonesia.',
    '',
    'FORMAT WAJIB — tulis PERSIS dengan judul ini, satu bagian per paragraf:',
    '',
    'APA YANG TERJADI',
    '(1–2 kalimat sederhana: apa peristiwanya, kapan, dan seberapa serius.)',
    '',
    'YANG SUDAH DILAKUKAN',
    '(1–2 kalimat: tindakan yang sudah dikerjakan guru atau sekolah selama ini.)',
    '',
    'KOMUNIKASI',
    '(1–2 kalimat: sudah berapa kali berkomunikasi dengan orang tua, lewat apa, dan apa hasilnya. Kalau belum ada, katakan belum ada.)',
    '',
    'SUDAH SAMPAI MANA',
    '(1–2 kalimat: posisi kasus sekarang — apa yang masih berjalan dan apa yang belum.)',
    '',
    'SARAN UNTUK GURU',
    '(3–4 butir, tiap butir diawali tanda hubung "-". Saran harus mengikuti SOP dan pilihan SANKSI di bawah: pilih langkah SOP yang belum dikerjakan, lalu sebutkan bentuk sanksi yang sesuai dari Buku Pedoman Disiplin.)',
    '',
    '════════ DATA KASUS ════════',
    facts,
    '',
    '════════ BUKU PEDOMAN DISIPLIN (SOP + SANKSI) ════════',
    handbook,
  ].join('\n');
}

// ─── Sanitizer ───────────────────────────────────────────────────────────────

/**
 * Model sesekali menyelipkan huruf non-Latin (mis. Mandarin/Cyrillic) di tengah
 * kata Indonesia — "tanpa ter记录 penanganan". Karakter seperti itu dibuang
 * supaya hasil selalu bisa dibaca guru dan orang tua.
 */
export function sanitizeAiText(text: string): string {
  return String(text ?? '')
    .replace(
      /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0900-\u097F\u0E00-\u0E7F\u1100-\u11FF\u3000-\u303F\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]+/g,
      '',
    )
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Parse output ────────────────────────────────────────────────────────────

/**
 * Pecah blok teks AI per judul bagian supaya UI bisa merender tiap topik
 * terpisah. Model boleh menulis judul polos, `## APA YANG TERJADI`, atau
 * `**APA YANG TERJADI**` — ketiganyaKENALI.
 */
export function parseSummarySections(raw: string): Record<SummarySectionKey, string> {
  const empty: Record<SummarySectionKey, string> = {
    terjadi: '',
    sudah_dilakukan: '',
    komunikasi: '',
    posisi: '',
    saran: '',
  };

  const text = sanitizeAiText(String(raw ?? '').replace('[AI-GENERATED SUMMARY]', '')).trim();
  if (!text) return empty;

  const markerOf = (line: string): SummarySectionKey | null => {
    const normalized = line
      .trim()
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .replace(/[:*_#\s]+$/, '')
      .trim()
      .toUpperCase();
    return SUMMARY_SECTIONS.find((s) => s.marker === normalized)?.key ?? null;
  };

  let current: SummarySectionKey | null = null;
  const buffer: Record<SummarySectionKey, string[]> = {
    terjadi: [],
    sudah_dilakukan: [],
    komunikasi: [],
    posisi: [],
    saran: [],
  };

  for (const line of text.split(/\r?\n/)) {
    const key = markerOf(line);
    if (key) {
      current = key;
      continue;
    }
    if (current) buffer[current].push(line);
  }

  (Object.keys(buffer) as SummarySectionKey[]).forEach((key) => {
    empty[key] = tidySection(buffer[key]);
  });

  return empty;
}

/** Bersihkan isi satu bagian: buang garis pemisah & markdown, rapatkan baris. */
function tidySection(lines: string[]): string {
  return lines
    .filter((line) => !/^\s*(?:[-*_]\s*){3,}$/.test(line))
    .map((line) => line.replace(/^\s*#{1,6}\s*/, '').replace(/\*\*/g, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateCaseSummary(tenantId: string, caseId: string): Promise<CaseAiInsight> {
  const client = await getClientWithTenant(tenantId);
  try {
    // 1. AI settings. Field names (`enabled` / `apiUrl` / `apiKey`) must match
    //    what the settings form saves — see tenant-settings.service.ts.
    const aiSettings = await getAiSettings(tenantId);

    if (!aiSettings.enabled) {
      throw new Error('AI capabilities are disabled for this tenant.');
    }
    if (!aiSettings.apiUrl || !aiSettings.apiKey) {
      throw new Error(
        'AI configuration is incomplete. Please configure API URL and Key in IT Admin settings.',
      );
    }

    // 2. Full case detail + Buku Pedoman Displin (SOP + SANKSI)
    const ctx = await loadCaseContext(tenantId, caseId, client);
    const categoryId = mapRiskToCategoryId(ctx.caseRow.risk_level);
    const reference = await loadHandbookReference(ctx, categoryId, ctx.levelId);
    const { facts, daysOpen } = buildFactSheet(ctx);

    // 3. Call LLM (OpenAI-compatible). Upstream (sumopod/GLM) occasionally
    //    returns an instant 400/5xx blip that succeeds on retry, so try twice
    //    before giving up. Auth failures (401/403) are config problems — no
    //    point retrying those.
    const apiUrl = aiSettings.apiUrl.replace(/\/$/, '') + '/chat/completions';
    const buildRequest = () =>
      fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aiSettings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiSettings.model || 'default',
          messages: [
            {
              role: 'system',
              content:
                'Kamu adalah guru BK berpengalaman. Menulis ringkasan kasus dalam Bahasa Indonesia yang sederhana, hangat, dan tidak menghakimi. Jangan memakai kata bahasa Inggris dan jangan memakai markdown. Ikuti persis format yang diminta.',
            },
            { role: 'user', content: buildPrompt(facts, renderHandbook(reference)) },
          ],
          temperature: 0.3,
        }),
      });

    let response = await buildRequest();
    if (!response.ok && response.status !== 401 && response.status !== 403) {
      await new Promise((r) => setTimeout(r, 1500));
      response = await buildRequest();
    }

    if (!response.ok) {
      // Include the upstream error body — statusText alone ("Bad Request") gave
      // no clue whether it was an auth, model-name, or context-length problem.
      const errBody = await response.text().catch(() => '');
      throw new Error(
        `AI Service error: ${response.status} ${response.statusText}` +
        (errBody ? ` — ${errBody.slice(0, 400)}` : ''),
      );
    }

    const data = (await response.json()) as any;
    const content: string = data?.choices?.[0]?.message?.content || '';
    const summary = `[AI-GENERATED SUMMARY]\n${sanitizeAiText(content).trim()}`;
    const sections = parseSummarySections(content);

    return {
      summary,
      sections,
      reference,
      stats: {
        incidents: ctx.incidents.length,
        interventions_done: ctx.interventions.filter((i) => i.completed_at).length,
        interventions_total: ctx.interventions.length,
        communications: ctx.communications.length,
        observations: ctx.observations.length,
        days_open: daysOpen,
      },
    };
  } finally {
    client.release();
  }
}

export async function saveConfirmedSummary(
  tenantId: string,
  caseId: string,
  summary: string,
  actorId: string,
): Promise<void> {
  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');

    // Using jsonb_set to safely inject into metadata
    await client.query(
      `UPDATE cases 
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ai_summary}', $1::jsonb)
       WHERE case_id = $2 AND tenant_id = $3`,
      [JSON.stringify(summary), caseId, tenantId],
    );

    await auditLog({
      action: 'AI_SUMMARY_CONFIRMED',
      entityType: 'cases',
      entityId: caseId,
      after: { ai_summary: summary },
      tenantId,
      actorId,
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
// ─── Background generation jobs ─────────────────────────────────────────────
// Generation takes 80-100+s, longer than the 100s Cloudflare proxy timeout, so
// the POST route only STARTS a job and the frontend polls the status endpoint.
// Single tsx process → an in-memory map is sufficient; jobs older than the TTL
// are pruned on read so a backend restart just means "start again".

export interface GenerationJobState {
  status: 'running' | 'done' | 'error';
  started_at: number;
  insight?: CaseAiInsight;
  error?: string;
}

const JOB_TTL_MS = 10 * 60_000;
const genJobs = new Map<string, GenerationJobState>();

export function getGenerationJob(tenantId: string, caseId: string): GenerationJobState | null {
  const key = `${tenantId}:${caseId}`;
  const job = genJobs.get(key);
  if (job && Date.now() - job.started_at > JOB_TTL_MS) {
    genJobs.delete(key);
    return null;
  }
  return job ?? null;
}

export function startGenerationJob(tenantId: string, caseId: string): GenerationJobState {
  const key = `${tenantId}:${caseId}`;
  const existing = getGenerationJob(tenantId, caseId);
  // A job younger than 5 min that is still running is reused, never doubled.
  if (existing?.status === 'running' && Date.now() - existing.started_at < 5 * 60_000) {
    return existing;
  }
  const job: GenerationJobState = { status: 'running', started_at: Date.now() };
  genJobs.set(key, job);
  generateCaseSummary(tenantId, caseId)
    .then((insight) => {
      job.insight = insight;
      job.status = 'done';
    })
    .catch((err) => {
      job.error = err instanceof Error ? err.message : 'Unknown AI error';
      job.status = 'error';
    });
  return job;
}
