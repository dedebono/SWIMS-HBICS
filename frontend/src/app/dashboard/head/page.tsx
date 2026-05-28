"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, ShieldAlert, FileText, CheckCircle, Bot, Sparkles, ChevronDown, ChevronUp, ExternalLink, AlertTriangle, AlertCircle, HeartHandshake } from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CaseRow {
  case_id: string;
  student_id: string;
  case_type: string;
  status: string;
  risk_level: string;
  opened_date: string;
  student_name?: string;
}

interface CaseSummaryResult {
  case_id: string;
  case_type: string;
  risk_level: string;
  student_name?: string;
  summary: string | null;
  status: "pending" | "loading" | "done" | "error";
  error?: string;
}

// ─── Risk / Status colours ────────────────────────────────────────────────────

const riskColors: Record<string, string> = {
  LOW: "bg-severity-low/15 text-severity-low border-severity-low/30",
  MEDIUM: "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  HIGH: "bg-severity-high/15 text-severity-high border-severity-high/30",
  CRITICAL:
    "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
};

const typeIcons: Record<string, string> = {
  BEHAVIORAL: "🔴",
  EMOTIONAL: "💙",
  MEDICAL: "🏥",
  ACADEMIC: "📚",
  POSITIVE: "⭐",
};

// ─── Dashboard Stat Card ──────────────────────────────────────────────────────

function DashboardCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="glass border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-8 w-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

// ─── Individual Case Summary Card ─────────────────────────────────────────────

function CaseSummaryCard({ item }: { item: CaseSummaryResult }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border border-border/50 bg-indigo-50/30 dark:bg-indigo-950/10 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">{typeIcons[item.case_type] ?? "📋"}</span>
          <span className="text-sm font-semibold">
            Case #{item.case_id.slice(0, 8)}
          </span>
          {item.student_name && (
            <span className="text-xs text-primary font-medium">
              👤 {item.student_name}
            </span>
          )}
          <Badge
            variant="outline"
            className={`text-[10px] ${riskColors[item.risk_level] ?? ""}`}
          >
            {item.risk_level}
          </Badge>
          <span className="text-xs text-muted-foreground">{item.case_type}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status indicator */}
          {item.status === "loading" && (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          )}
          {item.status === "done" && (
            <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
              ✓ Done
            </span>
          )}
          {item.status === "error" && (
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          )}

          {/* View case link */}
          <Link
            href={`/dashboard/cases/${item.case_id}`}
            target="_blank"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>

          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-indigo-100 dark:border-indigo-900/30">
          {item.status === "pending" && (
            <p className="text-xs text-muted-foreground mt-3">
              Waiting to be analysed…
            </p>
          )}
          {item.status === "loading" && (
            <div className="flex items-center gap-2 mt-3">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              <p className="text-xs text-indigo-600 dark:text-indigo-400">
                Generating AI insight…
              </p>
            </div>
          )}
          {item.status === "error" && (
            <p className="text-xs text-red-500 mt-3">
              ⚠ {item.error ?? "Failed to generate summary."}
            </p>
          )}
          {item.status === "done" && item.summary && (
            <div className="pt-2">
              <AiSummaryDisplay summary={item.summary} />
            </div>
          )}
          {item.status === "done" && !item.summary && (
            <p className="text-xs text-muted-foreground mt-3">
              No summary returned for this case.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchoolHeadDashboard() {
  const { user } = useAuth();

  // Stats (real data from API)
  const [openCount, setOpenCount] = useState<number | "…">("…");
  const [criticalCount, setCriticalCount] = useState<number | "…">("…");

  // AI Summary state
  const [isRunning, setIsRunning] = useState(false);
  const [summaryResults, setSummaryResults] = useState<CaseSummaryResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Fetch basic stats on mount
  useEffect(() => {
    const fetchStats = async () => {
      const [openRes, critRes] = await Promise.all([
        apiClient<CaseRow[]>("/cases?status=OPEN&limit=100"),
        apiClient<CaseRow[]>("/cases?status=OPEN&risk_level=CRITICAL&limit=100"),
      ]);
      if (openRes.success) setOpenCount(openRes.meta?.total ?? (openRes.data?.length ?? 0));
      if (critRes.success) setCriticalCount(critRes.meta?.total ?? (critRes.data?.length ?? 0));
    };
    fetchStats();
  }, []);

  // ─── Generate AI summaries for all open cases ────────────────────────────────
  const handleGenerateAllSummaries = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setSummaryResults([]);
    setProgress({ done: 0, total: 0 });

    // 1. Fetch all open cases (up to 100)
    const casesRes = await apiClient<CaseRow[]>("/cases?status=OPEN&limit=100");
    if (!casesRes.success || !casesRes.data || casesRes.data.length === 0) {
      toast.info("No open cases found to summarise.");
      setIsRunning(false);
      return;
    }

    const openCases = casesRes.data;
    const totalCases = openCases.length;

    // 2. Build initial result rows (all "pending")
    const initialResults: CaseSummaryResult[] = openCases.map((c) => ({
      case_id: c.case_id,
      case_type: c.case_type,
      risk_level: c.risk_level,
      student_name: c.student_name,
      summary: null,
      status: "pending",
    }));

    setSummaryResults(initialResults);
    setProgress({ done: 0, total: totalCases });

    // 3. Process cases sequentially (to avoid hammering AI backend)
    let doneCount = 0;
    for (const c of openCases) {
      // Mark as loading
      setSummaryResults((prev) =>
        prev.map((r) =>
          r.case_id === c.case_id ? { ...r, status: "loading" } : r
        )
      );

      try {
        const res = await apiClient<{ summary: string; ai_confidence_score?: number }>(
          `/cases/${c.case_id}/insights/generate`,
          { method: "POST" }
        );

        setSummaryResults((prev) =>
          prev.map((r) =>
            r.case_id === c.case_id
              ? {
                  ...r,
                  status: res.success ? "done" : "error",
                  summary: res.success && res.data ? res.data.summary : null,
                  error: res.success ? undefined : (res.error ?? "Unknown error"),
                }
              : r
          )
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Network error";
        setSummaryResults((prev) =>
          prev.map((r) =>
            r.case_id === c.case_id
              ? { ...r, status: "error", error: message }
              : r
          )
        );
      }

      doneCount++;
      setProgress({ done: doneCount, total: totalCases });
    }

    toast.success(`AI summaries generated for ${totalCases} open case${totalCases !== 1 ? "s" : ""}.`);
    setIsRunning(false);
  }, [isRunning]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  const progressPct =
    progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          School Head Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          Institution-wide metrics and critical escalations.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Total Open Cases"
          value={openCount}
          icon={<Activity className="text-blue-500" />}
        />
        <DashboardCard
          title="Critical Incidents"
          value={criticalCount}
          icon={<ShieldAlert className="text-red-500" />}
        />
        <DashboardCard
          title="Pending Approvals"
          value="—"
          icon={<FileText className="text-orange-500" />}
        />
        <DashboardCard
          title="Resolved This Week"
          value="—"
          icon={<CheckCircle className="text-green-500" />}
        />
      </div>

      {/* Two-column section */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle>Recent Critical Escalations</CardTitle>
            <CardDescription>
              Cases escalated by Counselors requiring Principal review.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center border-t">
            <p className="text-muted-foreground text-sm">
              No critical escalations pending review.
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Institution Analytics</CardTitle>
            <CardDescription>
              High-level trends across all school phases.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center border-t">
            <p className="text-muted-foreground text-sm">
              Analytics dashboard placeholder
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── AI Summary Panel ──────────────────────────────────────────────── */}
      <Card className="glass border-border/50">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              AI Summary — All Open Cases
            </CardTitle>
            <CardDescription>
              Use AI to generate a brief insight for every currently open case
              in one click.
            </CardDescription>
          </div>

          <Button
            onClick={handleGenerateAllSummaries}
            disabled={isRunning}
            className="shrink-0 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Bot className="w-4 h-4" />
            {isRunning
              ? `Analysing… (${progress.done}/${progress.total})`
              : "Generate AI Summary"}
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Progress bar */}
          {isRunning && progress.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Processing cases</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isRunning && summaryResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 border border-dashed border-border/50 rounded-lg">
              <div className="h-12 w-12 rounded-full bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center">
                <Bot className="w-6 h-6 text-indigo-400" />
              </div>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Click{" "}
                <span className="font-medium text-indigo-500">
                  "Generate AI Summary"
                </span>{" "}
                to analyse all open cases and produce a per-case AI insight.
              </p>
            </div>
          )}

          {/* Results list */}
          {summaryResults.length > 0 && (
            <div className="space-y-3">
              {/* Summary header */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {summaryResults.filter((r) => r.status === "done").length} of{" "}
                  {summaryResults.length} cases summarised
                </span>
                {!isRunning && (
                  <button
                    onClick={() => setSummaryResults([])}
                    className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    Clear
                  </button>
                )}
              </div>

              {summaryResults.map((item) => (
                <CaseSummaryCard key={item.case_id} item={item} />
              ))}

              {/* AI disclaimer */}
              {!isRunning && (
                <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 pt-1">
                  <Bot className="w-3 h-3" />
                  AI-generated summaries. Please review each for accuracy before
                  acting on them.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
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
    </div>
  );
}
