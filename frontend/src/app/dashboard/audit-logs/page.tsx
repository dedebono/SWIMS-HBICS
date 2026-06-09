'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import {
  Shield,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  User,
  Building2,
  Clock,
  Filter,
  X
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditLogRow {
  log_id: string;
  tenant_id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditLogMeta {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

// ─── Action Labels & Colours ─────────────────────────────────────────────────

const actionConfig: Record<string, { label: string; color: string; bg: string }> = {
  // Auth
  LOGIN: { label: 'Login', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  LOGOUT: { label: 'Logout', color: 'text-zinc-600', bg: 'bg-zinc-100 dark:bg-zinc-900/30' },
  USER_CREATED: { label: 'User Created', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' },
  USER_UPDATED: { label: 'User Updated', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  // Cases
  CASE_CREATED: { label: 'Case Created', color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/30' },
  CASE_UPDATED: { label: 'Case Updated', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  CASE_CLOSED: { label: 'Case Closed', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  // Incidents
  INCIDENT_CREATED: { label: 'Incident Created', color: 'text-rose-600', bg: 'bg-rose-100 dark:bg-rose-900/30' },
  INCIDENT_UPDATED: { label: 'Incident Updated', color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  // Interventions
  INTERVENTION_CREATED: { label: 'Intervention Created', color: 'text-cyan-600', bg: 'bg-cyan-100 dark:bg-cyan-900/30' },
  INTERVENTION_UPDATED: { label: 'Intervention Updated', color: 'text-teal-600', bg: 'bg-teal-100 dark:bg-teal-900/30' },
  // Reports
  REPORT_GENERATED: { label: 'Report Generated', color: 'text-indigo-600', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
  // RTBF
  RTBF_EXECUTED: { label: 'RTBF Executed', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
  RTBF_PDF_GENERATED: { label: 'RTBF Certificate', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
  // Consents
  CONSENT_UPDATED: { label: 'Consent Updated', color: 'text-lime-600', bg: 'bg-lime-100 dark:bg-lime-900/30' },
  // Media
  MEDIA_UPLOADED: { label: 'Media Uploaded', color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  MEDIA_DELETED: { label: 'Media Deleted', color: 'text-pink-600', bg: 'bg-pink-100 dark:bg-pink-900/30' },
  // Positive
  POSITIVE_OBSERVATION_CREATED: { label: 'Positive Observation', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  // AI
  AI_INSIGHTS_GENERATED: { label: 'AI Insights', color: 'text-indigo-600', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
  // Pattern Detection
  PATTERN_DETECTED: { label: 'Pattern Detected', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
};

function getActionConfig(action: string) {
  if (actionConfig[action]) return actionConfig[action];
  // Fallback: extract category from action name
  const category = action.split('_')[0];
  return {
    label: action.replace(/_/g, ' '),
    color: 'text-zinc-600 dark:text-zinc-400',
    bg: 'bg-zinc-100 dark:bg-zinc-900/30'
  };
}

// ─── Entity Type Icons ────────────────────────────────────────────────────────

const entityIcons: Record<string, React.ReactNode> = {
  cases: <FileText className="w-3.5 h-3.5" />,
  incidents: <span className="text-xs">⚠️</span>,
  interventions: <span className="text-xs">💊</span>,
  students: <User className="w-3.5 h-3.5" />,
  users: <Building2 className="w-3.5 h-3.5" />,
  reports: <span className="text-xs">📊</span>,
  consents: <span className="text-xs">📋</span>,
  media_assets: <span className="text-xs">📎</span>,
  positive_observations: <span className="text-xs">⭐</span>,
};

// ─── Filter Bar ───────────────────────────────────────────────────────────────

interface Filters {
  action: string;
  entity_type: string;
  from: string;
  to: string;
}

function FilterBar({
  filters,
  onChange,
  onClear
}: {
  filters: Filters;
  onChange: (k: keyof Filters, v: string) => void;
  onClear: () => void;
}) {
  const hasFilters = filters.action || filters.entity_type || filters.from || filters.to;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="Search by action..."
          value={filters.action}
          onChange={(e) => onChange('action', e.target.value)}
          className="h-9 flex-1"
        />
      </div>

      <Select value={filters.entity_type} onValueChange={(v) => onChange('entity_type', v ? (v === 'all' ? '' : v) : '')}>
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue placeholder="Entity type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Entities</SelectItem>
          <SelectItem value="cases">Cases</SelectItem>
          <SelectItem value="incidents">Incidents</SelectItem>
          <SelectItem value="interventions">Interventions</SelectItem>
          <SelectItem value="students">Students</SelectItem>
          <SelectItem value="users">Users</SelectItem>
          <SelectItem value="reports">Reports</SelectItem>
          <SelectItem value="consents">Consents</SelectItem>
          <SelectItem value="media_assets">Media</SelectItem>
          <SelectItem value="positive_observations">Positive Obs.</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => onChange('from', e.target.value)}
          className="h-9 w-[150px]"
        />
        <span className="text-muted-foreground text-xs">to</span>
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => onChange('to', e.target.value)}
          className="h-9 w-[150px]"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} className="h-9 gap-1.5 text-muted-foreground">
          <X className="w-3.5 h-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}

// ─── Log Row ─────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: AuditLogRow }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = getActionConfig(log.action);

  const formatDate = (iso: string) => {
    try {
      return format(parseISO(iso), 'dd MMM yyyy, HH:mm:ss');
    } catch {
      return iso;
    }
  };

  const shortId = log.entity_id ? log.entity_id.slice(0, 8) : null;

  return (
    <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
      {/* Row header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Entity icon */}
        <div className="shrink-0 text-muted-foreground">
          {entityIcons[log.entity_type] ?? <Clock className="w-3.5 h-3.5" />}
        </div>

        {/* Action badge */}
        <Badge variant="outline" className={`${cfg.color} ${cfg.bg} border-0 shrink-0 font-medium text-xs`}>
          {cfg.label}
        </Badge>

        {/* Entity info */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-muted-foreground font-mono">
            {log.entity_type}
          </span>
          {shortId && (
            <>
              <span className="text-muted-foreground/40">/</span>
              <span className="text-xs font-mono text-muted-foreground">
                #{shortId}
              </span>
            </>
          )}
        </div>

        {/* Timestamp */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {formatDate(log.created_at)}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-border/50 bg-muted/20">
          <div className="grid gap-3 mt-3 text-xs">
            <div className="grid grid-cols-[120px_1fr] gap-1">
              <span className="text-muted-foreground font-medium">Log ID</span>
              <span className="font-mono text-muted-foreground">{log.log_id}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-1">
              <span className="text-muted-foreground font-medium">Actor ID</span>
              <span className="font-mono text-muted-foreground">{log.actor_id}</span>
            </div>
            {log.ip_address && (
              <div className="grid grid-cols-[120px_1fr] gap-1">
                <span className="text-muted-foreground font-medium">IP Address</span>
                <span className="font-mono text-muted-foreground">{log.ip_address}</span>
              </div>
            )}
            {log.before_state && (
              <div className="grid grid-cols-[120px_1fr] gap-1">
                <span className="text-muted-foreground font-medium">Before</span>
                <pre className="font-mono text-muted-foreground bg-muted rounded px-2 py-1 overflow-auto">
                  {JSON.stringify(log.before_state, null, 2)}
                </pre>
              </div>
            )}
            {log.after_state && (
              <div className="grid grid-cols-[120px_1fr] gap-1">
                <span className="text-muted-foreground font-medium">After</span>
                <pre className="font-mono text-muted-foreground bg-muted rounded px-2 py-1 overflow-auto">
                  {JSON.stringify(log.after_state, null, 2)}
                </pre>
              </div>
            )}
            {log.user_agent && (
              <div className="grid grid-cols-[120px_1fr] gap-1">
                <span className="text-muted-foreground font-medium">User Agent</span>
                <span className="text-muted-foreground break-all">{log.user_agent}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [meta, setMeta] = useState<AuditLogMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({
    action: '',
    entity_type: '',
    from: '',
    to: '',
  });

  const LIMIT = 30;

  const fetchLogs = useCallback(async (pg: number, f: Filters) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(pg),
      limit: String(LIMIT),
    });
    if (f.action) params.set('action', f.action);
    if (f.entity_type) params.set('entity_type', f.entity_type);
    if (f.from) params.set('from', new Date(f.from).toISOString());
    if (f.to) params.set('to', new Date(f.to + 'T23:59:59').toISOString());

    const res = await apiClient<AuditLogRow[]>(`/audit-logs?${params}`);
    if (res.success && res.data) {
      setLogs(res.data);
      setMeta(res.meta as AuditLogMeta);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs(page, filters);
  }, [page, filters, fetchLogs]);

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ action: '', entity_type: '', from: '', to: '' });
    setPage(1);
  };

  const totalPages = meta ? Math.ceil(meta.total / LIMIT) : 1;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground mt-1">
            Immutable record of all sensitive actions across the institution.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchLogs(page, filters)}
          className="gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilterBar
            filters={filters}
            onChange={handleFilterChange}
            onClear={clearFilters}
          />
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Activity Log</CardTitle>
            {meta && (
              <span className="text-xs text-muted-foreground">
                {meta.total.toLocaleString()} total — page {page} of {totalPages}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Shield className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No audit logs found.</p>
              <p className="text-xs text-muted-foreground/60">
                Try adjusting your filters or check back later.
              </p>
            </div>
          ) : (
            <>
              {logs.map((log) => (
                <LogRow key={log.log_id} log={log} />
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="gap-1.5"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!meta?.hasMore}
                    className="gap-1.5"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
