"use client";

import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, ShieldAlert, FileText, CheckCircle } from "lucide-react";

export default function SchoolHeadDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          School Head Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          Institution-wide metrics and critical escalations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardCard title="Total Open Cases" value="24" icon={<Activity className="text-blue-500" />} />
        <DashboardCard title="Critical Incidents" value="3" icon={<ShieldAlert className="text-red-500" />} />
        <DashboardCard title="Pending Approvals" value="7" icon={<FileText className="text-orange-500" />} />
        <DashboardCard title="Resolved This Week" value="12" icon={<CheckCircle className="text-green-500" />} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle>Recent Critical Escalations</CardTitle>
            <CardDescription>Cases escalated by Counselors requiring Principal review.</CardDescription>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center border-t">
            <p className="text-muted-foreground text-sm">No critical escalations pending review.</p>
          </CardContent>
        </Card>
        
        <Card className="glass">
          <CardHeader>
            <CardTitle>Institution Analytics</CardTitle>
            <CardDescription>High-level trends across all school phases.</CardDescription>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center border-t">
            <p className="text-muted-foreground text-sm">Analytics dashboard placeholder</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardCard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
  return (
    <Card className="glass border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
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
