'use client';

import { useEffect, useState, use } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
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

interface TimelineEvent {
  id: string;
  type: 'INCIDENT' | 'INTERVENTION' | 'OBSERVATION' | 'CASE_STATUS_CHANGE';
  date: string;
  category: string;
  severity?: string;
  description: string;
  reported_by_name?: string;
  case_id?: string;
  relevance_weight: number;
}

interface StudentProgress {
  has_data: boolean;
  cases: { total: number; open: number; monitoring: number; closed: number; closure_rate: number };
  interventions: { total: number; completed: number; scheduled: number; completion_rate: number };
  incidents: { total: number };
  observations: { total: number };
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  progress_percentage: number;
}

const riskBadge: Record<string, string> = {
  LOW: 'bg-severity-low/15 text-severity-low border-severity-low/30',
  MEDIUM: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  HIGH: 'bg-severity-high/15 text-severity-high border-severity-high/30',
  CRITICAL: 'bg-severity-critical/15 text-severity-critical border-severity-critical/30',
};

const eventColors: Record<string, { dot: string; line: string; bg: string; label: string }> = {
  INCIDENT: {
    dot: 'bg-event-incident',
    line: 'border-event-incident/30',
    bg: 'bg-event-incident/5 border-event-incident/20',
    label: 'Incident',
  },
  OBSERVATION: {
    dot: 'bg-event-observation',
    line: 'border-event-observation/30',
    bg: 'bg-event-observation/5 border-event-observation/20',
    label: 'Achievement',
  },
  INTERVENTION: {
    dot: 'bg-event-intervention',
    line: 'border-event-intervention/30',
    bg: 'bg-event-intervention/5 border-event-intervention/20',
    label: 'Intervention',
  },
  CASE_STATUS_CHANGE: {
    dot: 'bg-event-case-change',
    line: 'border-event-case-change/30',
    bg: 'bg-event-case-change/5 border-event-case-change/20',
    label: 'Case',
  },
};

const severityColors: Record<string, string> = {
  LOW: 'bg-severity-low/15 text-severity-low border-severity-low/30',
  MEDIUM: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  HIGH: 'bg-severity-high/15 text-severity-high border-severity-high/30',
  CRITICAL: 'bg-severity-critical/15 text-severity-critical border-severity-critical/30',
};

function getRelevanceLabel(weight: number): { label: string; color: string } {
  if (weight > 0.7) return { label: 'High', color: 'text-severity-low' };
  if (weight > 0.4) return { label: 'Medium', color: 'text-severity-medium' };
  return { label: 'Low', color: 'text-muted-foreground' };
}

export default function StudentTimelinePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const resolvedParams = use(params);
  const { user } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [progress, setProgress] = useState<StudentProgress | null>(null);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const res = await apiClient<StudentProgress>(
          `/students/${resolvedParams.studentId}/progress`,
        );
        if (res.success && res.data) setProgress(res.data);
      } catch {
        /* non-fatal: timeline still renders */
      }
    };
    fetchProgress();
  }, [resolvedParams.studentId]);

  useEffect(() => {
    const fetchTimeline = async () => {
      setIsLoading(true);
      const params = new URLSearchParams({ page: '1', limit: '100' });
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (fromDate) params.set('from', new Date(fromDate).toISOString());
      if (toDate) params.set('to', new Date(toDate).toISOString());

      const res = await apiClient<TimelineEvent[]>(
        `/students/${resolvedParams.studentId}/timeline?${params.toString()}`,
      );
      if (res.success && res.data) {
        setEvents(res.data);
      }
      setIsLoading(false);
    };
    fetchTimeline();
  }, [resolvedParams.studentId, typeFilter, fromDate, toDate]);

  const toggleExpand = (id: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Student Timeline</h2>
        <p className="text-muted-foreground">
          Chronological view of the student’s <span className="font-medium">cases</span> and <span className="font-medium">achievements</span>{' '}
          (plus incidents and interventions) for student{' '}
          <span className="font-mono text-xs">{resolvedParams.studentId.slice(0, 8)}...</span>
        </p>
      </div>

      {/* Filter Bar */}
      <Card className="glass border-border/50">
        <CardContent className="flex flex-wrap gap-3 p-4">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? 'all')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="INCIDENT">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-event-incident" /> Incidents
                </span>
              </SelectItem>
              <SelectItem value="OBSERVATION">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-event-observation" /> Achievements
                </span>
              </SelectItem>
              <SelectItem value="INTERVENTION">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-event-intervention" /> Interventions
                </span>
              </SelectItem>
              <SelectItem value="CASE_STATUS_CHANGE">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-event-case-change" /> Cases
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">From</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">To</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-40"
            />
          </div>

          {(typeFilter !== 'all' || fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTypeFilter('all');
                setFromDate('');
                setToDate('');
              }}
            >
              Clear Filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Progress Summary */}
      {progress && (
        <Card className="glass border-border/50">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Student Progress</h3>
              {progress.risk_level && (
                <Badge variant="outline" className={`text-[10px] ${riskBadge[progress.risk_level]}`}>
                  {progress.risk_level} risk
                </Badge>
              )}
            </div>

            {!progress.has_data ? (
              <p className="text-xs text-muted-foreground">
                No cases, interventions, or incidents recorded yet.
              </p>
            ) : (
              <>
                {/* Overall progress bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Overall progress</span>
                    <span className="font-medium text-foreground">{progress.progress_percentage}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress.progress_percentage}%` }}
                    />
                  </div>
                </div>

                {/* Stat grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Cases</p>
                    <p className="text-lg font-bold">{progress.cases.total}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {progress.cases.open} open · {progress.cases.monitoring} mon · {progress.cases.closed} closed
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Interventions</p>
                    <p className="text-lg font-bold">
                      {progress.interventions.completed}/{progress.interventions.total}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{progress.interventions.scheduled} scheduled</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Incidents</p>
                    <p className="text-lg font-bold">{progress.incidents.total}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Achievements</p>
                    <p className="text-lg font-bold text-green-600">{progress.observations.total}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center py-16">
            <p className="text-muted-foreground">No events found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Try adjusting your date range or event type filter
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative ml-4">
          {/* Vertical line */}
          <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

          <div className="space-y-4">
            {events.map((event) => {
              const colors = eventColors[event.type] ?? eventColors['CASE_STATUS_CHANGE']!;
              const isExpanded = expandedEvents.has(event.id);
              const relevance = getRelevanceLabel(event.relevance_weight);
              const isBoardMember = user?.role === 'BOARD_MEMBER';

              return (
                <div key={event.id} className="relative flex gap-4 pl-4">
                  {/* Dot */}
                  <div className={`absolute left-0 top-3 h-6 w-6 rounded-full border-2 border-background ${colors.dot} flex items-center justify-center`}>
                    <div className="h-2 w-2 rounded-full bg-background" />
                  </div>

                  {/* Event Card */}
                  <div
                    className={`ml-6 flex-1 cursor-pointer rounded-lg border p-4 transition-all ${colors.bg} hover:shadow-md`}
                    onClick={() => toggleExpand(event.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${colors.bg}`}>
                            {colors.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(event.date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {event.severity && (
                            <Badge variant="outline" className={`text-[10px] ${severityColors[event.severity] ?? ''}`}>
                              {event.severity}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-medium">
                          {event.category}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${relevance.color}`}>
                          ● {relevance.label} relevance
                        </span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`text-muted-foreground/50 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                        <p className="text-sm text-muted-foreground">
                          {isBoardMember ? '[Content restricted for Board Members]' : event.description}
                        </p>
                        {event.reported_by_name && !isBoardMember && (
                          <p className="text-xs text-muted-foreground/70">
                            Reported by: {event.reported_by_name}
                          </p>
                        )}
                        {event.case_id && (
                          <a
                            href={`/dashboard/cases/${event.case_id}`}
                            className="text-xs text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View Case →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
