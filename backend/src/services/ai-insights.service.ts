import { getClientWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';

export async function generateCaseSummary(tenantId: string, caseId: string): Promise<string> {
  const client = await getClientWithTenant(tenantId);
  try {
    // 1. Fetch AI Settings
    const { rows: tenantRows } = await client.query('SELECT settings FROM tenants WHERE tenant_id = $1', [tenantId]);
    const settings = tenantRows[0]?.settings || {};
    const aiSettings = settings.ai || {};

    if (!aiSettings.enabled) {
      throw new Error('AI capabilities are disabled for this tenant.');
    }

    if (!aiSettings.apiUrl) {
      throw new Error('AI configuration is incomplete. Please configure API URL in IT Admin settings.');
    }

    // 2. Fetch Case History
    const { rows: caseRows } = await client.query('SELECT summary FROM cases WHERE case_id = $1 AND tenant_id = $2', [caseId, tenantId]);
    if (caseRows.length === 0) throw new Error('Case not found');

    const { rows: incidents } = await client.query(
      'SELECT severity, category, description, incident_at FROM incidents WHERE case_id = $1 AND deleted_at IS NULL ORDER BY incident_at ASC',
      [caseId]
    );

    const { rows: interventions } = await client.query(
      `SELECT type, description, scheduled_at, completed_at, outcome, effectiveness, metadata
       FROM interventions WHERE case_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       ORDER BY COALESCE(scheduled_at, created_at) ASC`,
      [caseId, tenantId]
    );

    // Build readable incident text
    const incidentText = incidents.length > 0
      ? incidents.map((i: any) =>
          `- [${new Date(i.incident_at).toLocaleDateString()}] ${i.severity} severity, ${i.category}: ${i.description}`
        ).join('\n')
      : '(No incidents recorded)';

    // Build readable intervention text
    const INTERVENTION_LABELS: Record<string, string> = {
      COUNSELING_SESSION: 'Counseling Session',
      THERAPY_REFERRAL: 'Therapy Referral',
      ADVISORY_MEETING: 'Advisory / Advice Given',
      PARENT_MEETING: 'Parent / Guardian Meeting',
      PARENT_CALL: 'Parent / Guardian Call',
      DISCIPLINARY_ACTION: 'Disciplinary Action',
      PEER_MEDIATION: 'Peer Mediation',
      ACADEMIC_SUPPORT: 'Academic Support Plan',
      WELLNESS_CHECK: 'Wellness Check',
      EXTERNAL_REFERRAL: 'External Agency Referral',
      OTHER: 'Other',
    };

    const interventionText = interventions.length > 0
      ? interventions.map((iv: any) => {
          const meta = iv.metadata || {};
          const label = INTERVENTION_LABELS[iv.type] || iv.type;
          const date = iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleDateString() : 'unspecified date';
          const handler = meta.handler_name
            ? `${meta.handler_name}${meta.handled_by_role ? ` (${meta.handled_by_role})` : ''}`
            : 'Staff';
          const status = iv.completed_at ? 'completed' : 'pending';
          const parentNote = meta.parent_notified
            ? `Parent/guardian${meta.parent_contact_name ? ` (${meta.parent_contact_name})` : ''} was notified via ${meta.parent_contact_method || 'unspecified method'}.`
            : '';
          const outcomeNote = iv.outcome ? `Outcome: ${iv.outcome}` : '';
          const effectivenessNote = iv.effectiveness ? `Effectiveness rated ${iv.effectiveness}/5.` : '';
          const followUp = meta.follow_up_required
            ? `Follow-up required${meta.follow_up_date ? ` by ${new Date(meta.follow_up_date).toLocaleDateString()}` : ''}.`
            : '';
          const parts = [
            `- [${date}] ${label} by ${handler} (${status}): ${iv.description}`,
            parentNote, outcomeNote, effectivenessNote, followUp,
          ].filter(Boolean);
          return parts.join(' ');
        }).join('\n')
      : '(No interventions recorded)';

    // 3. Call LLM (OpenAI Compatible)
    const prompt = `
You are a school welfare assistant. Write a clear, simple summary of the following student case.
Use plain, everyday language that a parent or non-specialist can easily understand.
Structure your response in two short paragraphs:
  1. "What happened" — briefly describe the incidents or concerns raised.
  2. "How it was handled" — briefly describe the interventions taken by school staff.
Do NOT include personal judgements, diagnoses, or recommendations. Only summarize the facts.

--- INCIDENT HISTORY ---
${incidentText}

--- INTERVENTIONS / ACTIONS TAKEN ---
${interventionText}
    `;

    let endpointUrl = (aiSettings.apiUrl || '').trim().replace(/\/+$/, '');
    console.log(`[AI-DEBUG] raw apiUrl: "${endpointUrl}"`);

    // Only preserve URL as-is if it ends with a known complete endpoint path
    if (!endpointUrl.endsWith('/v1/chat/completions') &&
        !endpointUrl.endsWith('/api/generate') &&
        !endpointUrl.endsWith('/api/chat')) {
      // Strip incomplete /v1 suffix, then append full path
      endpointUrl = endpointUrl.replace(/\/v1$/i, '') + '/v1/chat/completions';
    }
    console.log(`[AI-DEBUG] final endpointUrl: "${endpointUrl}"`);

    const isOllamaFormat = endpointUrl.endsWith('/api/generate') || endpointUrl.endsWith('/api/chat');

    let payload;
    if (endpointUrl.endsWith('/api/generate')) {
      payload = {
        model: aiSettings.model || "default",
        prompt: prompt,
        stream: false
      };
    } else if (endpointUrl.endsWith('/api/chat')) {
      payload = {
        model: aiSettings.model || "default",
        messages: [{ role: "user", content: prompt }],
        stream: false
      };
    } else {
      // OpenAI-compatible (default)
      payload = {
        model: aiSettings.model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      };
    }

    console.log(`[AI] Calling ${endpointUrl} (model: ${payload.model})`);
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiSettings.apiKey || ''}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Read body once as text, then try to parse JSON
    const rawText = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error(`[AI] Non-JSON response (${response.status}): ${rawText.slice(0, 500)}`);
      throw new Error(`AI Service returned non-JSON response. Check your API URL (${endpointUrl}). Response: ${rawText.slice(0, 200)}`);
    }

    if (!response.ok) {
      const errorBody = (data as any)?.error?.message || (data as any)?.error || JSON.stringify(data);
      throw new Error(`AI Service error: ${response.statusText} - ${errorBody}`);
    }
    let summary = 'No summary generated.';

    if (endpointUrl.endsWith('/api/generate')) {
      summary = (data as any).response || summary;
    } else if (endpointUrl.endsWith('/api/chat')) {
      summary = (data as any).message?.content || summary;
    } else {
      summary = (data as any).choices?.[0]?.message?.content || summary;
    }

    // Enforce explicitly labeling
    return `[AI-GENERATED SUMMARY]\n${summary.trim()}`;
  } finally {
    client.release();
  }
}

export async function saveConfirmedSummary(
  tenantId: string, 
  caseId: string, 
  summary: string, 
  actorId: string
): Promise<void> {
  const client = await getClientWithTenant(tenantId);
  try {
    await client.query('BEGIN');
    
    // Using jsonb_set to safely inject into metadata
    await client.query(
      `UPDATE cases 
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ai_summary}', $1::jsonb)
       WHERE case_id = $2 AND tenant_id = $3`,
      [JSON.stringify(summary), caseId, tenantId]
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
