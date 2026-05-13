"use client";

import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, TrendingUp, ShieldCheck } from "lucide-react";

export default function BoardMemberDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Foundation Board View
        </h1>
        <p className="text-muted-foreground mt-2">
          Anonymized, high-level compliance and wellbeing metrics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Compliance Score</CardTitle>
            <ShieldCheck className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">98%</div>
            <p className="text-xs text-muted-foreground mt-1">All protocols met</p>
          </CardContent>
        </Card>
        
        <Card className="glass border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Wellbeing Trend</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">+4.2%</div>
            <p className="text-xs text-muted-foreground mt-1">Positive observations increase</p>
          </CardContent>
        </Card>

        <Card className="glass border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Anonymized Incident Data</CardTitle>
            <PieChart className="h-5 w-5 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">Ready</div>
            <p className="text-xs text-muted-foreground mt-1">Quarterly reports compiled</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
