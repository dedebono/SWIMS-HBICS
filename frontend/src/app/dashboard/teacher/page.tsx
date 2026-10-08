'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, FileText, Users, Plus } from 'lucide-react';
import { classificationLabel } from '@/lib/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyStudent {
  student_id: string;
  full_name: string;
  incident_count: number;
  last_incident_at: string;
  last_severity: string;
}

interface MyIncident {
  incident_id: string;
  student_id: string;
  case_id: string;
  category: string;
  sub_category: string | null;
  severity: string;
  description: string;
  location: string | null;
  incident_at: string;
  immediate_actions: string | null;
  metadata: {
    involved_students?: string[];
    evidence?: Record<string, boolean>;
    initial_assessment?: Record<string, boolean>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const severityColors: Record<string, string> = {
  LOW: 'bg-severity-low/15 text-severity-low border-severity-low/30',
  MEDIUM: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  HIGH: 'bg-severity-high/15 text-severity-high border-severity-high/30',
  CRITICAL: 'bg-severity-critical/15 text-severity-critical border-severity-critical/30',
};

const severityDot: Record<string, string> = {
  LOW: 'bg-severity-low',
  MEDIUM: 'bg-severity-medium',
  HIGH: 'bg-severity-high',
  CRITICAL: 'bg-severity-critical animate-pulse',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeacherDashboardPage() {
  const { user } = useAuth();
  const [myStudents, setMyStudents] = useState<MyStudent[]>([]);
  const [myIncidents, setMyIncidents] = useState<MyIncident[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [studentsRes, incidentsRes] = await Promise.all([
          apiClient<MyStudent[]>('/my-students'),
          apiClient<{ data: MyIncident[] }>('/my-reports?limit=50'),
        ]);

        if (studentsRes.success && studentsRes.data) {
          setMyStudents(Array.isArray(studentsRes.data) ? studentsRes.data : []);
        }
        if (incidentsRes.success && incidentsRes.data) {
          const raw = incidentsRes.data as any;
          setMyIncidents(Array.isArray(raw) ? raw : (raw?.data ?? []));
        }
      } catch (err) {
        console.error('Failed to load teacher data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const totalIncidents = myIncidents.length;
  const criticalCount = myIncidents.filter((i) => i.severity === 'CRITICAL').length;
  const highCount = myIncidents.filter((i) => i.severity === 'HIGH').length;
  const recentIncidents = [...myIncidents].slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Welcome back, {user?.full_name?.split(' ')[0]}
          </h2>
          <p className="text-muted-foreground">
            Your reported incidents and students at a glance.
          </p>
        </div>
        <Link href="/dashboard/incidents/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Report Incident
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Total Incidents */}
        <Card className="glass border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              My Reported Incidents
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {isLoading ? <span className="animate-pulse text-muted-foreground">—</span> : totalIncidents}
            </div>
            <p className="text-xs text-muted-foreground mt-1">incidents you have filed</p>
          </CardContent>
        </Card>

        {/* Critical + High */}
        <Card className="glass border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              High / Critical
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-severity-critical/10">
              <AlertTriangle className="h-4 w-4 text-severity-critical" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-severity-critical">
              {isLoading ? <span className="animate-pulse text-muted-foreground">—</span> : criticalCount + highCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {criticalCount} critical · {highCount} high severity
            </p>
          </CardContent>
        </Card>

        {/* Students Reported */}
        <Card className="glass border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Students Reported
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-2/10">
              <Users className="h-4 w-4 text-chart-2" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {isLoading ? <span className="animate-pulse text-muted-foreground">—</span> : myStudents.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">distinct students in your reports</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">

          {/* My Students */}
          <Card className="glass border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Students You Reported
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {myStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No students reported yet. Use &quot;Report Incident&quot; to get started.
                </p>
              ) : (
                myStudents.map((s) => (
                  <Link
                    key={s.student_id}
                    href={`/dashboard/cases?student_id=${s.student_id}`}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-card/50 p-3 transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${severityDot[s.last_severity] ?? 'bg-muted'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.incident_count} incident{s.incident_count !== 1 ? 's' : ''} · last{' '}
                          {new Date(s.last_incident_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${severityColors[s.last_severity] ?? ''}`}>
                      {s.last_severity}
                    </Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent Incidents */}
          <Card className="glass border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Recent Reports
              </CardTitle>
              <Link href="/dashboard/incidents/new">
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                  <Plus className="h-3 w-3" /> New
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentIncidents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No incidents filed yet.
                </p>
              ) : (
                recentIncidents.map((inc) => {
                  // find student name
                  const student = myStudents.find((s) => s.student_id === inc.student_id);
                  return (
                    <Link
                      key={inc.incident_id}
                      href={`/dashboard/cases/${inc.case_id}`}
                      className="block rounded-lg border border-border/50 bg-card/50 p-3 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-medium">{inc.category}</p>
                        {inc.sub_category && (
                          <span className="text-xs text-muted-foreground">/ {inc.sub_category}</span>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${severityColors[inc.severity] ?? ''}`}>
                          {classificationLabel(inc.severity)}
                        </Badge>
                      </div>
                      {student && (
                        <p className="text-xs text-primary font-medium mb-0.5">👤 {student.full_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-2">{inc.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/70">
                        <span>📅 {new Date(inc.incident_at).toLocaleString()}</span>
                        {inc.location && <span>📍 {inc.location}</span>}
                      </div>
                    </Link>
                  );
                })
              )}
              {myIncidents.length > 5 && (
                <p className="text-xs text-center text-muted-foreground pt-1">
                  Showing 5 of {myIncidents.length} incidents
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
