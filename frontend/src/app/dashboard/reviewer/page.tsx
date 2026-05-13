"use client";

import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Search, AlertTriangle, FileCheck2 } from "lucide-react";

export default function CaseReviewerDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Case Review Audit
        </h1>
        <p className="text-muted-foreground mt-2">
          Perform audits, risk verifications, and compliance checks on resolved cases.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Audits</CardTitle>
            <Search className="h-5 w-5 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">5</div>
            <p className="text-xs text-muted-foreground mt-1">Randomly selected this week</p>
          </CardContent>
        </Card>
        
        <Card className="glass border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disputed Risk Levels</CardTitle>
            <AlertTriangle className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">1</div>
            <p className="text-xs text-muted-foreground mt-1">Requires manual arbitration</p>
          </CardContent>
        </Card>

        <Card className="glass border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cases Approved</CardTitle>
            <FileCheck2 className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">142</div>
            <p className="text-xs text-muted-foreground mt-1">YTD compliance verified</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle>Audit Queue</CardTitle>
          <CardDescription>Select a case to begin your compliance review.</CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center border-t">
          <p className="text-muted-foreground text-sm">Your audit queue is currently empty.</p>
        </CardContent>
      </Card>
    </div>
  );
}
