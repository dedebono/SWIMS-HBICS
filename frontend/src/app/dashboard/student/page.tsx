'use client';

import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function StudentDashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Welcome back, {user?.full_name?.split(' ')[0]}
        </h2>
        <p className="text-muted-foreground">
          This is your personal student dashboard.
        </p>
      </div>

      <Card className="glass border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-24 text-center">
          <h3 className="text-lg font-semibold">Student Portal Under Construction</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-2">
            Features for students (viewing personal timeline, interventions) will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
