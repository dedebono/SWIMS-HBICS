// ─── Case status display constants ─────────────────────────────────────────────
export const RISK_COLORS: Record<string, string> = {
  LOW: 'bg-severity-low/15 text-severity-low border-severity-low/30',
  MEDIUM: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  HIGH: 'bg-severity-high/15 text-severity-high border-severity-high/30',
  CRITICAL: 'bg-severity-critical/15 text-severity-critical border-severity-critical/30 animate-pulse',
};

export const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-primary/15 text-primary border-primary/30',
  MONITORING: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  CLOSED: 'bg-muted text-muted-foreground border-border',
};

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = typeof RISK_LEVELS[number];

export const CASE_STATUSES = ['OPEN', 'MONITORING', 'CLOSED'] as const;
export type CaseStatus = typeof CASE_STATUSES[number];

export const COMMUNICATION_CHANNELS = ['PHONE', 'EMAIL', 'IN_PERSON', 'APP', 'INTERNAL'] as const;
export const CONTACT_ROLES = ['PARENT', 'GUARDIAN', 'TEACHER', 'INTERNAL'] as const;
