import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send } from 'lucide-react';

interface CaseCommunicationRow {
  comm_id: string;
  author_id: string;
  message: string;
  channel: string;
  contact_name: string;
  contact_role: string;
  created_at: string;
}

export function CommunicationsTab({ caseId }: { caseId: string }) {
  const [comms, setComms] = useState<CaseCommunicationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchComms = async () => {
    setIsLoading(true);
    const res = await apiClient<CaseCommunicationRow[]>(`/cases/${caseId}/communications`);
    if (res.success && res.data) {
      setComms(res.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchComms();
  }, [caseId]);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setIsSubmitting(true);
    const res = await apiClient<CaseCommunicationRow>(`/cases/${caseId}/communications`, {
      method: 'POST',
      body: {
        message,
        contact_name: "Parent/Guardian", // Hardcoded for MVP UI demo
        contact_role: "PARENT",
        channel: "APP"
      }
    });

    if (res.success && res.data) {
      setComms([...comms, res.data]);
      setMessage('');
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading communications...</div>;
  }

  return (
    <div className="space-y-4">
      {comms.length === 0 ? (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center py-12">
            <MessageSquare className="h-8 w-8 text-muted-foreground opacity-50 mb-2" />
            <p className="text-muted-foreground text-sm">No communications logged yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 pb-2">
          {comms.map((comm) => (
            <Card key={comm.comm_id} className="glass border-border/50 bg-muted/20">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs font-semibold">To: {comm.contact_name} ({comm.contact_role}) via {comm.channel}</p>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(comm.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comm.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Append New Record */}
      <div className="pt-4 border-t border-border/50 space-y-3">
        <h4 className="text-sm font-medium">Log New Communication</h4>
        <Textarea 
          placeholder="Type update here to append to thread..." 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3} 
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSubmit} disabled={!message.trim() || isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Append Log'} <Send className="ml-2 w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
