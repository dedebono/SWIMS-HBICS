'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
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
import { Plus, AlertTriangle } from 'lucide-react';

interface IncidentRow {
  incident_id: string;
  student_id: string;
  case_id: string;
  category: string;
  sub_category: string | null;
  severity: string;
  description: string;
  location: string | null;
  student_grade?: string | null;
  incident_at: string;
  immediate_actions: string | null;
  reported_by: string;
  involved_teacher?: string | null;
  involved_teacher_name?: string | null;
  metadata: {
    involved_students?: string[];
    evidence?: Record<string, boolean>;
    initial_assessment?: Record<string, boolean>;
    manual_involved_teacher?: string;
  };
}

// Name map filled from /incidents/my-students
interface StudentName {
  student_id: string;
  full_name: string;
}

const severityColors: Record<string, string> = {
  LOW: 'bg-severity-low/15 text-severity-low border-severity-low/30',
  MEDIUM: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  HIGH: 'bg-severity-high/15 text-severity-high border-severity-high/30',
  CRITICAL: 'bg-severity-critical/15 text-severity-critical border-severity-critical/30',
};

// Roles that see only their own reports
const REPORTER_ROLES = ['TEACHER', 'SUBSTITUTE_TEACHER'];

export default function IncidentsPage() {
  const { user } = useAuth();
  const isReporterOnly = REPORTER_ROLES.includes(user?.role ?? '');

  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetchIncidents = useCallback(async () => {
    setIsLoading(true);
    try {
      // Teachers see only their own reports; others see all (paginated)
      const endpoint = isReporterOnly
        ? `/incidents/my-reports?page=${page}&limit=50`
        : `/incidents/my-reports?page=${page}&limit=50`; // TODO: global view for admin/counselor
      // For now, everyone sees their own reports (global view can be added later)

      const [incRes, stuRes] = await Promise.all([
        apiClient<any>(`/incidents/my-reports?page=${page}&limit=50`),
        apiClient<StudentName[]>('/incidents/my-students'),
      ]);

      if (incRes.success && incRes.data) {
        const raw = incRes.data as any;
        const list: IncidentRow[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
        setIncidents(list);
        setTotal(raw?.total ?? list.length);
      }

      if (stuRes.success && stuRes.data) {
        const nameMap: Record<string, string> = {};
        const arr = Array.isArray(stuRes.data) ? stuRes.data : [];
        for (const s of arr) {
          nameMap[s.student_id] = s.full_name;
        }
        setStudentNames(nameMap);
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, isReporterOnly]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const filtered = incidents.filter((inc) => {
    const matchesSeverity = severityFilter === 'all' || inc.severity === severityFilter;
    const matchesSearch =
      !search ||
      inc.category.toLowerCase().includes(search.toLowerCase()) ||
      inc.description.toLowerCase().includes(search.toLowerCase()) ||
      (studentNames[inc.student_id] ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (inc.involved_teacher_name ?? inc.involved_teacher ?? '').toLowerCase().includes(search.toLowerCase());
    return matchesSeverity && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isReporterOnly ? 'My Reported Incidents' : 'All Incidents'}
          </h2>
          <p className="text-muted-foreground">
            {isReporterOnly
              ? 'Incidents you have personally reported.'
              : 'All reported incidents across the school.'}
          </p>
        </div>
        <Link href="/dashboard/incidents/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Report Incident
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by student, category, description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
        <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v ?? 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-semibold">No incidents found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-2">
              {search || severityFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'No incidents have been reported yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((inc) => {
            const studentName = studentNames[inc.student_id];
            const evidence = inc.metadata?.evidence ?? {};
            const activeEvidence = Object.entries(evidence)
              .filter(([, v]) => v === true)
              .map(([k]) => k.toUpperCase());
            const assessment = inc.metadata?.initial_assessment ?? {};
            const flags: string[] = [];
            if ((assessment as any).needs_escalation) flags.push('Escalation');
            if ((assessment as any).needs_parent_comm) flags.push('Parent Comm');

            return (
              <Link key={inc.incident_id} href={`/dashboard/cases/${inc.case_id}`}>
                <Card className="glass border-border/50 cursor-pointer transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                  <CardContent className="p-4 space-y-2">
                    {/* Row 1: category + severity */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{inc.category}</p>
                        {inc.sub_category && (
                          <span className="text-xs text-muted-foreground">/ {inc.sub_category}</span>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${severityColors[inc.severity] ?? ''}`}>
                          {inc.severity}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                        <span>📅 {new Date(inc.incident_at).toLocaleString()}</span>
                        {inc.location && <span>· 📍 {inc.location}</span>}
                      </div>
                    </div>

                    {/* Row 2: Student name + involved teacher */}
                    {studentName && (
                      <p className="text-xs text-primary font-medium">👤 {studentName}</p>
                    )}
                    {(inc.metadata?.manual_involved_teacher || inc.involved_teacher_name || inc.involved_teacher) && (
                      <p className="text-xs text-muted-foreground/90">
                        👩‍🏫 Involved teacher: {inc.metadata?.manual_involved_teacher ?? inc.involved_teacher_name ?? inc.involved_teacher}
                      </p>
                    )}
                    {inc.student_grade && (
                      <p className="text-xs text-primary font-medium">🎓 Grade: {inc.student_grade}</p>
                    )}

                    {/* Row 3: Description */}
                    <p className="text-sm text-muted-foreground line-clamp-2">{inc.description}</p>

                    {/* Row 4: Immediate actions */}
                    {inc.immediate_actions && (
                      <p className="text-xs text-muted-foreground/70 italic line-clamp-1">
                        Actions: {inc.immediate_actions}
                      </p>
                    )}

                    {/* Row 5: Evidence + flags */}
                    {(activeEvidence.length > 0 || flags.length > 0) && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {activeEvidence.map((e) => (
                          <Badge key={e} variant="secondary" className="text-[9px]">{e}</Badge>
                        ))}
                        {flags.map((f) => (
                          <Badge key={f} variant="outline" className="text-[9px] border-orange-400/40 text-orange-500">{f}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}

          {/* Pagination */}
          {total > 50 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button variant="outline" size="sm" disabled={page * 50 >= total} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
