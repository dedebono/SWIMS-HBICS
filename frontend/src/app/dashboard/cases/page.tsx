'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Users,
  Share2,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

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
  student_name?: string;
  reported_by_name?: string;
}

interface TeacherItem {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
}

interface CaseShare {
  share_id: string;
  shared_with: string;
  shared_with_name: string;
  shared_with_role: string;
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
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Share state
  const [shareDialogCase, setShareDialogCase] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [sharesMap, setSharesMap] = useState<Record<string, CaseShare[]>>({});
  const [isSharing, setIsSharing] = useState(false);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);

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

  useEffect(() => {
    // Fetch shares for all visible cases
    if (cases.length === 0) return;
    const caseIds = cases.map(c => c.case_id);
    Promise.all(
      caseIds.map(caseId =>
        apiClient<CaseShare[]>(`/cases/${caseId}/shares`)
          .then(res => ({ caseId, shares: res.success && res.data ? res.data : [] }))
      )
    ).then(results => {
      const map: Record<string, CaseShare[]> = {};
      for (const r of results) map[r.caseId] = r.shares;
      setSharesMap(map);
    });
  }, [cases]);

  const openShareDialog = async (caseId: string) => {
    setShareDialogCase(caseId);
    setSelectedTeachers([]);
    if (teachers.length === 0) {
      setIsLoadingTeachers(true);
      const res = await apiClient<{ rows: TeacherItem[]; total: number; page: number; hasMore: boolean }>('/users/teachers');
      if (res.success && res.data) setTeachers(res.data.rows);
      setIsLoadingTeachers(false);
    }
  };

  const handleShare = async () => {
    if (!shareDialogCase || selectedTeachers.length === 0) return;
    setIsSharing(true);
    const res = await apiClient(`/cases/${shareDialogCase}/share`, {
      method: 'POST',
      body: { shared_with: selectedTeachers, permission: 'CONTRIBUTE' },
    });
    if (res.success) {
      toast.success('Case shared successfully');
      setShareDialogCase(null);
      // Refresh shares
      const sharesRes = await apiClient<CaseShare[]>(`/cases/${shareDialogCase}/shares`);
      if (sharesRes.success && sharesRes.data) {
        setSharesMap(prev => ({ ...prev, [shareDialogCase]: sharesRes.data! }));
      }
    } else {
      toast.error(res.error || 'Failed to share case');
    }
    setIsSharing(false);
  };

  const toggleTeacher = (userId: string) => {
    setSelectedTeachers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

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
            {user?.role === 'TEACHER' && ' (scoped to your reports & shared)'}
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
          {filteredCases.map((c) => {
            const shares = sharesMap[c.case_id] || [];
            return (
              <Card key={c.case_id} className="glass border-border/50 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                <CardContent className="flex items-center gap-4 p-4">
                  <Link href={`/dashboard/cases/${c.case_id}`} className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="text-2xl shrink-0">{typeIcons[c.case_type] ?? '📋'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        Case #{c.case_id.slice(0, 8)}
                      </p>
                      {c.student_name && (
                        <p className="text-xs text-primary font-medium">👤 {c.student_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className={`text-[10px] ${statusColors[c.status] ?? ''}`}>
                          {c.status}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground">
                          {c.case_type} • Opened {new Date(c.opened_date).toLocaleDateString()}
                          {c.reported_by_name && ` • Reported by ${c.reported_by_name}`}
                        </p>
                      </div>
                      {shares.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <Users className="w-3 h-3 text-blue-500" />
                          <span className="text-[10px] text-blue-500 font-medium">
                            Shared with {shares.map(s => s.shared_with_name).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-xs ${riskColors[c.risk_level] ?? ''}`}>
                      {c.risk_level}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openShareDialog(c.case_id)}
                      title="Share this case"
                    >
                      <Share2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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

      {/* Share Dialog */}
      <Dialog open={!!shareDialogCase} onOpenChange={(open) => !open && setShareDialogCase(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" />
              Share Case
            </DialogTitle>
            <DialogDescription>
              Select teachers to share this case with. Shared teachers can view details and log interventions.
            </DialogDescription>
          </DialogHeader>
          {isLoadingTeachers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No teachers found.</p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {teachers.map(t => {
                const isSelected = selectedTeachers.includes(t.user_id);
                return (
                  <button
                    key={t.user_id}
                    type="button"
                    onClick={() => toggleTeacher(t.user_id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      isSelected
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted/50 border border-transparent'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.email} • {t.role.replace('_', ' ')}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogCase(null)}>
              Cancel
            </Button>
            <Button onClick={handleShare} disabled={selectedTeachers.length === 0 || isSharing}>
              {isSharing ? 'Sharing...' : `Share with ${selectedTeachers.length} teacher${selectedTeachers.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
