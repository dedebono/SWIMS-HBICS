import { getClientWithTenant } from '../db/pool.js';
import { auditLog } from '../utils/audit-log.js';

export async function generateCaseSummary(tenantId: string, caseId: string): Promise<string> {
  const client = await getClientWithTenant(tenantId);
  try {
    // 1. Fetch AI Settings
    const { rows: tenantRows } = await client.query('SELECT settings FROM tenants WHERE tenant_id = $1', [tenantId]);
    const settings = tenantRows[0]?.settings || {};
    const aiSettings = settings.ai || {};

    if (!aiSettings.aiEnabled) {
      throw new Error('AI capabilities are disabled for this tenant.');
    }

    if (!aiSettings.aiApiUrl || !aiSettings.aiApiKey) {
      throw new Error('AI configuration is incomplete. Please configure API URL and Key in IT Admin settings.');
    }

    // 2. Fetch Case History
    const { rows: caseRows } = await client.query('SELECT summary FROM cases WHERE case_id = $1 AND tenant_id = $2', [caseId, tenantId]);
    if (caseRows.length === 0) throw new Error('Case not found');
    
    const { rows: incidents } = await client.query('SELECT severity, category, description, incident_at FROM incidents WHERE case_id = $1 AND deleted_at IS NULL ORDER BY incident_at ASC', [caseId]);
    
    const historyText = incidents.map((i: any) => `[${i.incident_at}] ${i.severity} (${i.category}): ${i.description}`).join('\n');

    // 3. Call LLM (OpenAI Compatible)
    const prompt = `
      You are an AI assistant. Summarize the following student case history factually.
      DO NOT recommend actions. DO NOT classify the student. ONLY summarize what happened.
      
      Case History:
      ${historyText}
    `;

    const response = await fetch(aiSettings.aiApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiSettings.aiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "default", // Or could be configurable
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`AI Service error: ${response.statusText}`);
    }

    const data = await response.json();
    const summary = (data as any).choices?.[0]?.message?.content || 'No summary generated.';

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
