import fs from 'fs';
import path from 'path';

export interface BlocklistConfig {
  flagged_terms: Array<{
    term: string;
    suggestion: string;
  }>;
}

// Simulated per-tenant blocklist loader
// Default fallback provided if tenant config doesn't exist
// In production, this might be loaded from Redis or `tenants.settings` JSONB payload
function loadBlocklist(tenantId: string): BlocklistConfig {
  const rootDir = process.cwd();
  const customPath = path.join(rootDir, 'config', `blocklist_${tenantId}.json`);
  
  if (fs.existsSync(customPath)) {
    try {
      const raw = fs.readFileSync(customPath, 'utf8');
      return JSON.parse(raw) as BlocklistConfig;
    } catch {
      // fallback to default
    }
  }

  // MVP Default blocklist (stigmatizing/labeling terms)
  return {
    flagged_terms: [
      { term: "crazy", suggestion: "experiencing severe distress or erratic behavior" },
      { term: "psycho", suggestion: "presenting with acute psychological symptoms" },
      { term: "insane", suggestion: "exhibiting highly unusual or disorganized behavior" },
      { term: "problem child", suggestion: "student experiencing challenges" },
      { term: "lazy", suggestion: "unmotivated or unable to engage with tasks" },
      { term: "stupid", suggestion: "struggling academically/cognitively" }
    ]
  };
}

export function validateNeutralLanguage(tenantId: string, text: string): { 
  passed: boolean; 
  flaggedList: Array<{ term: string; suggestion: string }> 
} {
  const blocklist = loadBlocklist(tenantId);
  const textLower = text.toLowerCase();
  
  const flagged = blocklist.flagged_terms.filter(word => 
    textLower.includes(word.term.toLowerCase())
  );

  return {
    passed: flagged.length === 0,
    flaggedList: flagged
  };
}
