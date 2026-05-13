import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface InterventionRow {
  intervention_id: string;
  type: string;
  description: string;
  scheduled_at: string | null;
  completed_at: string | null;
  outcome: string | null;
  effectiveness: number | null;
  created_at: string;
}

export function InterventionsTab({ caseId }: { caseId: string }) {
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchInterventions = async () => {
      const res = await apiClient<InterventionRow[]>(`/cases/${caseId}/interventions`);
      if (res.success && res.data) {
        setInterventions(res.data);
      }
      setIsLoading(false);
    };
    fetchInterventions();
  }, [caseId]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading interventions...</div>;
  }

  if (interventions.length === 0) {
    return (
      <Card className="glass border-border/50">
        <CardContent className="flex flex-col items-center py-12">
          <p className="text-muted-foreground text-sm">No interventions recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {interventions.map((inv) => (
        <Card key={inv.intervention_id} className="glass border-border/50">
          <CardContent className="p-4 flex flex-col space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-semibold">{inv.type}</p>
                <p className="text-xs text-muted-foreground mt-1">{inv.description}</p>
              </div>
              <Badge variant={inv.completed_at ? 'default' : 'outline'}>
                {inv.completed_at ? 'Completed' : 'Pending'}
              </Badge>
            </div>
            
            {(inv.scheduled_at || inv.completed_at) && (
              <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                {inv.scheduled_at && <span>Scheduled: {new Date(inv.scheduled_at).toLocaleDateString()}</span>}
                {inv.completed_at && <span>Completed: {new Date(inv.completed_at).toLocaleDateString()}</span>}
              </div>
            )}

            {inv.outcome && (
              <div className="mt-2 bg-muted/50 p-2 rounded-md text-xs">
                <strong>Outcome:</strong> {inv.outcome} 
                {inv.effectiveness && <span className="ml-2 text-primary">★ {inv.effectiveness}/5</span>}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
