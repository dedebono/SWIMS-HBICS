'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CaseRow {
  case_id: string;
  student_id: string;
  case_type: string;
  status: string;
  risk_level: string;
  assigned_counselor: string | null;
  opened_date: string;
  created_at: string;
  updated_at: string;
}

const riskColors: Record<string, string> = {
  LOW: 'bg-severity-low/15 text-severity-low border-severity-low/30',
  MEDIUM: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  HIGH: 'bg-severity-high/15 text-severity-high border-severity-high/30',
  CRITICAL: 'bg-severity-critical/15 text-severity-critical border-severity-critical/30',
};

const statusColors: Record<string, string> = {
  OPEN: 'bg-primary/15 text-primary border-primary/30',
  MONITORING: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  CLOSED: 'bg-muted text-muted-foreground border-border',
};

const typeIcons: Record<string, string> = {
  BEHAVIORAL: '🔴',
  EMOTIONAL: '💙',
  MEDICAL: '🏥',
  ACADEMIC: '📚',
  POSITIVE: '⭐',
};

export default function CasesPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const fetchCases = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (riskFilter !== 'all') params.set('risk_level', riskFilter);

    const res = await apiClient<CaseRow[]>(`/cases?${params.toString()}`);
    if (res.success && res.data) {
      setCases(res.data);
      setTotal(res.meta?.total ?? 0);
    }
    setIsLoading(false);
  }, [page, statusFilter, riskFilter]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const filteredCases = search
    ? cases.filter((c) =>
        c.case_id.toLowerCase().includes(search.toLowerCase()) ||
        c.case_type.toLowerCase().includes(search.toLowerCase()),
      )
    : cases;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cases</h2>
          <p className="text-muted-foreground">
            {total} total case{total !== 1 ? 's' : ''} found
          </p>
        </div>
        <Link href="/dashboard/incidents/new">
          <Button>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Report Incident
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search cases..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="MONITORING">Monitoring</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v ?? 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Risk Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cases Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filteredCases.length === 0 ? (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/30 mb-4">
              <path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z" />
              <path d="M15 2v5h5" />
            </svg>
            <p className="text-muted-foreground">No cases found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Try adjusting your filters or report a new incident
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredCases.map((c) => (
            <Link key={c.case_id} href={`/dashboard/cases/${c.case_id}`}>
              <Card className="glass border-border/50 cursor-pointer transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="text-2xl">{typeIcons[c.case_type] ?? '📋'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        Case #{c.case_id.slice(0, 8)}
                      </p>
                      <Badge variant="outline" className={`text-[10px] ${statusColors[c.status] ?? ''}`}>
                        {c.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.case_type} • Opened {new Date(c.opened_date).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${riskColors[c.risk_level] ?? ''}`}>
                    {c.risk_level}
                  </Badge>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/30">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
