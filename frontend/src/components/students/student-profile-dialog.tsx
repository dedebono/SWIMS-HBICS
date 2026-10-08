'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';

interface StudentProfile {
  student_id: string;
  full_name: string;
  national_id: string;
  enrollment: {
    class_name: string;
    academic_year: string;
  };
  summary: {
    total_active_cases: number;
    total_incidents: number;
    risk_level: string;
    positive_count: number;
    last_incident_date: string | null;
  };
  timeline: Array<{
    date: string;
    type: string;
    status: string;
    handled_by: string;
  }>;
}

export function StudentProfileDialog({
  studentId,
  open,
  onOpenChange,
}: {
  studentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && studentId) {
      setLoading(true);
      // Fetch the full aggregated profile for the popup tab
      apiClient(`/students/${studentId}/profile`)
        .then((res) => {
          if (res.success) {
            setProfile((res.data ?? null) as StudentProfile | null);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setProfile(null);
    }
  }, [open, studentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-full !max-w-[calc(100vw-2rem)] !max-h-[90vh] overflow-y-auto overflow-x-hidden p-6 sm:!p-8">
        <DialogHeader>
          <DialogTitle>Student Profile</DialogTitle>
          <DialogDescription>Overview and history for this student.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Basic Info */}
            <Card className="glass">
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">{profile.full_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">ID (NIS/NISN)</p>
                    <p className="font-medium">{profile.national_id || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Class</p>
                    <p className="font-medium">{profile.enrollment?.class_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Academic Year</p>
                    <p className="font-medium">{profile.enrollment?.academic_year || '-'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Behavior Summary */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Behavior Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">Active Cases</p>
                  <p className="text-2xl font-bold">{profile.summary?.total_active_cases || 0}</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">Incidents</p>
                  <p className="text-2xl font-bold">{profile.summary?.total_incidents || 0}</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">Risk Level</p>
                  <Badge variant={
                    profile.summary?.risk_level === 'CRITICAL' || profile.summary?.risk_level === 'HIGH' ? 'destructive' :
                    profile.summary?.risk_level === 'MEDIUM' ? 'secondary' : 'default'
                  }>
                    {profile.summary?.risk_level || 'LOW'}
                  </Badge>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">Positive Notes</p>
                  <p className="text-2xl font-bold text-green-600">{profile.summary?.positive_count || 0}</p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Chronological Timeline</h3>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="h-10 px-4 text-left font-medium">Date</th>
                      <th className="h-10 px-4 text-left font-medium">Type</th>
                      <th className="h-10 px-4 text-left font-medium">Status</th>
                      <th className="h-10 px-4 text-left font-medium">Handled By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.timeline?.length > 0 ? (
                      profile.timeline.map((item, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="p-4">{new Date(item.date).toLocaleDateString()}</td>
                          <td className="p-4">{item.type}</td>
                          <td className="p-4">
                            <Badge variant="outline">{item.status}</Badge>
                          </td>
                          <td className="p-4">{item.handled_by}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-muted-foreground">
                          No history found for this student.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="pt-2">
              <Link
                href={`/dashboard/students/${profile.student_id}/timeline`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View full student timeline &amp; progress →
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">Failed to load profile.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
