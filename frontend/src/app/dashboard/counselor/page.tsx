import { Metadata } from "next";
import { Suspense } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { 
  AlertCircle, 
  Clock, 
  Activity, 
  ShieldAlert,
  ArrowRight
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── API Fetchers ─────────────────────────────────────────────────────────────

async function getDashboardData() {
  const cookieStore = cookies();
  const token = (await cookieStore).get("token")?.value;

  if (!token) redirect("/login");

  const baseUrl = process.env.BACKEND_INTERNAL_URL 
    ? `${process.env.BACKEND_INTERNAL_URL}/api` 
    : 'http://127.0.0.1:4000/api';

  const res = await fetch(`${baseUrl}/counselor/dashboard`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401) redirect("/login");
    // If not counselor or missing perms, return empty default
    return { stats: null, dormantCases: [] };
  }

  const json = await res.json();
  return json.data;
}

// ─── Components ───────────────────────────────────────────────────────────────

function DashboardStats({ stats }: { stats: any }) {
  if (!stats) return <p className="text-muted-foreground p-4 text-center border rounded-lg bg-card/50">Dashboard metrics unavailable for this role.</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Open Cases</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeCases}</div>
          <p className="text-xs text-muted-foreground">Cases currently active</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Critical Risk</CardTitle>
          <ShieldAlert className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">{stats.criticalCases}</div>
          <p className="text-xs text-muted-foreground">Cases requiring immediate attention</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Overdue Interventions</CardTitle>
          <Clock className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-500">{stats.overdueInterventions}</div>
          <p className="text-xs text-muted-foreground">Action past scheduled date</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending Alerts</CardTitle>
          <AlertCircle className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-500">{stats.unreviewedAlerts}</div>
          <p className="text-xs text-muted-foreground">Unreviewed pattern detections</p>
        </CardContent>
      </Card>
    </div>
  );
}

function DormantCases({ cases }: { cases: any[] }) {
  if (cases.length === 0) {
    return (
      <Card className="col-span-1 border-dashed">
        <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
          <Activity className="h-8 w-8 mb-4 opacity-50" />
          No dormant cases found. All cases engaged recently.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Needs Engagement</CardTitle>
        <CardDescription>
          Cases with no activity recorded in the last 5 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {cases.map((c: any) => (
            <div key={c.case_id} className="flex items-center justify-between pb-4 border-b last:border-0 last:pb-0">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none flex items-center gap-2">
                  Case #{c.case_id.split('-')[0]}
                  <Badge variant={c.risk_level === 'CRITICAL' ? 'destructive' : c.risk_level === 'HIGH' ? 'destructive' : 'secondary'} className="text-[10px] px-1 py-0 h-4">
                    {c.risk_level}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last activity {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                </p>
              </div>
              <a href={`/dashboard/cases/${c.case_id}`}>
                <Button size="sm" variant="ghost">
                  Review <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </a>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Counselor Caseload Dashboard | SWIMS",
  description: "Monitor caseloads, overdue interventions, and alerts.",
};

export default async function CounselorDashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto h-full overflow-y-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Caseload Overview</h2>
        <p className="text-muted-foreground">Monitor high-urgency cases, alerts, and intervention schedules.</p>
      </div>

      <DashboardStats stats={data.stats} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Alerts / Activity stream would go in remaining span, for now just focus on Dormant cases */}
        <DormantCases cases={data.dormantCases} />
      </div>
    </div>
  );
}
