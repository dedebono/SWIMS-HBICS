'use client';

import { useEffect, useState, use } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Bot, Sparkles, User, AlertCircle, HeartHandshake } from 'lucide-react';
import { toast } from 'sonner';
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
import { InterventionsTab } from '@/components/cases/interventions-tab';
import { MediaTab } from '@/components/cases/media-tab';
import { CommunicationsTab } from '@/components/cases/communications-tab';
interface CaseDetail {
  case_id: string;
  student_id: string;
  case_type: string;
  status: string;
  risk_level: string;
  risk_level_source: string;
  assigned_counselor: string | null;
  school_phase_ref: string | null;
  opened_date: string;
  closed_date: string | null;
  summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface IncidentItem {
  incident_id: string;
  category: string;
  sub_category: string | null;
  severity: string;
  description: string;
  location: string | null;
  incident_at: string;
  immediate_actions: string | null;
  language_flag: boolean;
  witnesses: Array<{ user_id?: string; name: string; statement?: string }>;
  metadata: {
    involved_students?: string[];
    evidence?: {
      cctv?: boolean;
      photo?: boolean;
      video?: boolean;
      screenshot?: boolean;
      witness?: boolean;
      none?: boolean;
    };
    initial_assessment?: {
      is_recurring?: boolean;
      similar_cases?: boolean;
      needs_escalation?: boolean;
      needs_parent_comm?: boolean;
    };
  };
  reported_by: string;
  reporter_name?: string;
  created_at: string;
}

const riskColors: Record<string, string> = {
  LOW: 'bg-severity-low/15 text-severity-low border-severity-low/30',
  MEDIUM: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  HIGH: 'bg-severity-high/15 text-severity-high border-severity-high/30',
  CRITICAL: 'bg-severity-critical/15 text-severity-critical border-severity-critical/30 animate-pulse',
};

const statusColors: Record<string, string> = {
  OPEN: 'bg-primary/15 text-primary border-primary/30',
  MONITORING: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30',
  CLOSED: 'bg-muted text-muted-foreground border-border',
};

export default function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const resolvedParams = use(params);
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [studentData, setStudentData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [riskOverride, setRiskOverride] = useState('');
  const [justification, setJustification] = useState('');
  const [isOverriding, setIsOverriding] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const [caseRes, incRes] = await Promise.all([
        apiClient<CaseDetail>(`/cases/${resolvedParams.caseId}`),
        apiClient<IncidentItem[]>(`/cases/${resolvedParams.caseId}/incidents`),
      ]);

      if (caseRes.success && caseRes.data) {
        setCaseData(caseRes.data);
        const studentRes = await apiClient<any>(`/students/${caseRes.data.student_id}`);
        if (studentRes.success && studentRes.data) {
          setStudentData(studentRes.data);
        }
      }
      if (incRes.success && incRes.data) setIncidents(incRes.data);
      setIsLoading(false);
    };
    fetchData();
  }, [resolvedParams.caseId]);

  const handleRiskOverride = async () => {
    if (!riskOverride || !justification.trim()) return;
    setIsOverriding(true);
    const res = await apiClient<CaseDetail>(`/cases/${resolvedParams.caseId}`, {
      method: 'PATCH',
      body: {
        risk_level: riskOverride,
        risk_level_source: 'MANUAL',
        metadata: { risk_override_justification: justification },
      },
    });
    if (res.success && res.data) {
      setCaseData(res.data);
    }
    setIsOverriding(false);
    setJustification('');
  };

  const handleGenerateSummary = async () => {
    try {
      setIsGeneratingSummary(true);
      const res = await apiClient<{ summary: string; ai_confidence_score: number }>(
        `/cases/${resolvedParams.caseId}/insights/generate`,
        { method: 'POST' }
      );

      if (res.success && res.data) {
        setCaseData((prev) => prev ? { ...prev, summary: res.data!.summary } : null);
        toast.success('AI Insight generated successfully');
      } else {
        toast.error('Failed to generate AI insight');
      }
    } catch (error) {
      toast.error('An error occurred while communicating with the AI backend');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg font-medium text-muted-foreground">Case not found</p>
      </div>
    );
  }

  const isCounselor = user?.role === 'COUNSELOR';

  return (
    <div className="space-y-6">
      {/* Case Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">
              Case #{caseData.case_id.slice(0, 8)}
            </h2>
            <Badge variant="outline" className={statusColors[caseData.status] ?? ''}>
              {caseData.status}
            </Badge>
            <Badge variant="outline" className={riskColors[caseData.risk_level] ?? ''}>
              {caseData.risk_level} Risk
            </Badge>
            {caseData.risk_level_source === 'AUTO' && (
              <Badge variant="secondary" className="text-[10px]">AUTO</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {caseData.case_type} • {caseData.school_phase_ref ?? 'N/A'} •
            Opened {new Date(caseData.opened_date).toLocaleDateString()}
          </p>
        </div>

        <div className="flex gap-2">
          {/* Risk Override (COUNSELOR only) */}
          {isCounselor && (
            <Dialog>
              <DialogTrigger render={<Button variant="outline" size="sm" />}>
                Override Risk Level
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Override Risk Level</DialogTitle>
                  <DialogDescription>
                    Manually set the risk level. This locks auto-recalculation until explicitly unlocked.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>New Risk Level</Label>
                    <Select value={riskOverride} onValueChange={(v) => setRiskOverride(v ?? '')}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select risk level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="CRITICAL">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Justification (required)</Label>
                    <Textarea
                      placeholder="Explain why you are overriding the risk level..."
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleRiskOverride}
                    disabled={isOverriding || !riskOverride || !justification.trim()}
                  >
                    {isOverriding ? 'Saving...' : 'Apply Override'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        style={{ display: 'block', overflow: 'auto' }}
        defaultValue="overview" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="incidents">
            Incidents
            <Badge variant="secondary" className="ml-2 text-[10px]">{incidents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="interventions">Interventions</TabsTrigger>
          <TabsTrigger value="communications">Comms Log</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="space-y-4">
            {/* Student Details Card */}
            {studentData && (
              <Card className="glass border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    Student Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow label="Name" value={studentData.full_name} />
                  <InfoRow label="Student ID" value={studentData.student_id.slice(0, 8)} />
                  {studentData.metadata && Object.entries(studentData.metadata).map(([key, val]) => (
                    <InfoRow key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} value={String(val)} />
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="glass border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    AI Summary
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Covers incidents &amp; interventions
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSummary}
                  disabled={isGeneratingSummary}
                  className="h-8 gap-1 shrink-0"
                >
                  <Bot className="w-3.5 h-3.5" />
                  {isGeneratingSummary ? 'Analyzing...' : 'Generate Insight'}
                </Button>
              </CardHeader>
              <CardContent>
                {caseData.summary ? (
                  <AiSummaryDisplay summary={caseData.summary} />
                ) : (
                  <div className="flex flex-col items-center py-8 gap-2 rounded-lg border border-dashed border-border/50">
                    <Bot className="w-7 h-7 text-indigo-300" />
                    <p className="text-sm text-muted-foreground text-center max-w-xs">
                      Click <span className="font-medium text-indigo-500">"Generate Insight"</span> to analyse incidents and intervention logs and produce a plain-language summary.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass border-border/50">
              <CardHeader>
                <CardTitle className="text-sm">Case Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Type" value={caseData.case_type} />
                <InfoRow label="Status" value={caseData.status} />
                <InfoRow label="Risk Level" value={`${caseData.risk_level} (${caseData.risk_level_source})`} />
                <InfoRow label="School Phase" value={caseData.school_phase_ref ?? 'N/A'} />
                <InfoRow label="Opened" value={new Date(caseData.opened_date).toLocaleDateString()} />
                {caseData.closed_date && (
                  <InfoRow label="Closed" value={new Date(caseData.closed_date).toLocaleDateString()} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Incidents Tab */}
        <TabsContent value="incidents" className="space-y-3">
          {incidents.length === 0 ? (
            <Card className="glass border-border/50">
              <CardContent className="flex flex-col items-center py-12">
                <p className="text-muted-foreground">No incidents recorded</p>
              </CardContent>
            </Card>
          ) : (
            incidents.map((inc) => {
              const evidence = inc.metadata?.evidence ?? {};
              const assessment = inc.metadata?.initial_assessment ?? {};
              const involvedStudents = inc.metadata?.involved_students ?? [];
              const activeEvidence = Object.entries(evidence)
                .filter(([, v]) => v === true)
                .map(([k]) => k.toUpperCase());
              const activeAssessment: string[] = [];
              if (assessment.is_recurring) activeAssessment.push('Recurring');
              if (assessment.similar_cases) activeAssessment.push('Similar Cases');
              if (assessment.needs_escalation) activeAssessment.push('Escalation Needed');
              if (assessment.needs_parent_comm) activeAssessment.push('Parent Comm Needed');

              return (
                <Card key={inc.incident_id} className="glass border-border/50">
                  <CardContent className="p-4 space-y-3">
                    {/* Header row */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{inc.category}</p>
                        {inc.sub_category && (
                          <span className="text-xs text-muted-foreground">/ {inc.sub_category}</span>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${riskColors[inc.severity] ?? ''}`}>
                          {inc.severity}
                        </Badge>
                        {inc.language_flag && (
                          <Badge variant="destructive" className="text-[10px]">⚠ Language Flag</Badge>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-foreground leading-relaxed">{inc.description}</p>

                    {/* Immediate Actions */}
                    {inc.immediate_actions && (
                      <div className="rounded-md bg-muted/40 border border-border/50 p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Immediate Actions Taken</p>
                        <p className="text-sm">{inc.immediate_actions}</p>
                      </div>
                    )}

                    {/* Meta row: date, location */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground/70">
                      <span>📅 {new Date(inc.incident_at).toLocaleString()}</span>
                      {inc.location && <span>📍 {inc.location}</span>}
                      {inc.reporter_name && (
                        <span className="flex items-center gap-1 text-primary/80 font-medium">
                          <User className="w-3 h-3" />
                          Reported by: {inc.reporter_name}
                        </span>
                      )}
                    </div>

                    {/* Involved Students */}
                    {involvedStudents.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Involved / Victim(s)</p>
                        <p className="text-sm">{involvedStudents.join(', ')}</p>
                      </div>
                    )}

                    {/* Evidence & Assessment badges */}
                    <div className="flex flex-wrap gap-4">
                      {activeEvidence.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Evidence</p>
                          <div className="flex flex-wrap gap-1">
                            {activeEvidence.map((e) => (
                              <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {activeAssessment.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Initial Assessment</p>
                          <div className="flex flex-wrap gap-1">
                            {activeAssessment.map((a) => (
                              <Badge key={a} variant="outline" className="text-[10px] border-orange-400/40 text-orange-500">{a}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Interventions Tab */}
        <TabsContent value="interventions">
          <InterventionsTab caseId={caseData.case_id} />
        </TabsContent>

        {/* Communications Tab */}
        <TabsContent value="communications">
          <CommunicationsTab caseId={caseData.case_id} />
        </TabsContent>

        {/* Media Tab */}
        <TabsContent value="media">
          <MediaTab caseId={caseData.case_id} />
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <Card className="glass border-border/50">
            <CardContent className="flex flex-col items-center py-12">
              <p className="text-muted-foreground">
                View the full student timeline at{' '}
                <a href={`/dashboard/students/${caseData.student_id}/timeline`} className="text-primary underline">
                  Student Timeline
                </a>
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit">
          <Card className="glass border-border/50">
            <CardContent className="flex flex-col items-center py-12">
              <p className="text-muted-foreground">Audit trail for this case</p>
              <p className="text-xs text-muted-foreground/60 mt-1">View detailed audit logs for all changes to this case</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function AiSummaryDisplay({ summary }: { summary: string }) {
  const cleanSummary = summary.replace('[AI-GENERATED SUMMARY]', '').trim();
  const paragraphs = cleanSummary.split('\n\n').filter((p) => p.trim() !== '');
  
  let whatHappened = cleanSummary;
  let howHandled = '';

  if (paragraphs.length >= 2) {
    whatHappened = paragraphs[0];
    howHandled = paragraphs.slice(1).join('\n\n');
  }

  // Basic cleanup of list numbers/headers if LLM included them
  const cleanText = (text: string) => text.replace(/^(1\.|2\.|What happened:?|How it was handled:?|-|--)/i, '').trim();

  return (
    <div className="space-y-3">
      <div className="bg-rose-50/50 dark:bg-rose-950/20 p-3 rounded-md border border-rose-100 dark:border-rose-900/50">
        <h4 className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5 mb-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> What Happened
        </h4>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{cleanText(whatHappened)}</p>
      </div>
      
      {howHandled && (
        <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-3 rounded-md border border-emerald-100 dark:border-emerald-900/50">
          <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mb-1.5">
            <HeartHandshake className="w-3.5 h-3.5" /> How It Was Handled
          </h4>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{cleanText(howHandled)}</p>
        </div>
      )}
      
      <div className="pt-1 text-[10px] text-muted-foreground flex items-center gap-1">
        <Bot className="w-3 h-3" />
        AI-generated summary based on incidents and interventions. Please review for accuracy.
      </div>
    </div>
  );
}
