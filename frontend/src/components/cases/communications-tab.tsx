import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquare, Send, Users, User, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface CaseCommunicationRow {
  comm_id: string;
  author_id: string;
  message: string;
  channel: string;
  contact_name: string;
  contact_role: string;
  created_at: string;
  author_name?: string;
}

export function CommunicationsTab({ caseId }: { caseId: string }) {
  const { user } = useAuth();
  const [comms, setComms] = useState<CaseCommunicationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commsType, setCommsType] = useState<'parent' | 'internal'>('parent');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('PARENT');

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

  const filteredComms = comms.filter(c => {
    if (commsType === 'parent') return c.contact_role === 'PARENT' || c.contact_role === 'GUARDIAN';
    return c.contact_role === 'TEACHER' || c.contact_role === 'INTERNAL';
  });

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setIsSubmitting(true);

    const body: Record<string, unknown> = { message };

    if (commsType === 'parent') {
      if (!contactName.trim()) {
        toast.error('Please enter the parent/guardian contact name.');
        setIsSubmitting(false);
        return;
      }
      body.contact_name = contactName.trim();
      body.contact_role = contactRole;
      body.channel = 'IN_PERSON';
    } else {
      body.contact_name = `${user?.full_name || 'Staff'} (Internal Note)`;
      body.contact_role = 'INTERNAL';
      body.channel = 'INTERNAL';
      body.metadata = { is_internal: true, author_id: user?.user_id };
    }

    const res = await apiClient<CaseCommunicationRow>(`/cases/${caseId}/communications`, {
      method: 'POST',
      body,
    });

    if (res.success && res.data) {
      setComms([res.data, ...comms]);
      setMessage('');
      setContactName('');
    } else {
      toast.error(res.error || 'Failed to log communication.');
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading communications...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Type switcher */}
      <div className="flex gap-2 border-b border-border/50 pb-2">
        <button
          type="button"
          onClick={() => setCommsType('parent')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${
            commsType === 'parent'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <User className="w-3.5 h-3.5 inline mr-1.5" />
          Parent / Guardian Comms
        </button>
        <button
          type="button"
          onClick={() => setCommsType('internal')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${
            commsType === 'internal'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <Users className="w-3.5 h-3.5 inline mr-1.5" />
          Staff Notes (Internal)
        </button>
        <Button variant="ghost" size="sm" className="ml-auto h-9 w-9 p-0" onClick={fetchComms} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {filteredComms.length === 0 ? (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center py-12">
            <MessageSquare className="h-8 w-8 text-muted-foreground opacity-50 mb-2" />
            <p className="text-muted-foreground text-sm">
              {commsType === 'parent' ? 'No parent communications logged yet.' : 'No internal staff notes yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 pb-2">
          {filteredComms.map((comm) => (
            <Card key={comm.comm_id} className={`glass border-border/50 ${
              comm.contact_role === 'INTERNAL' ? 'bg-blue-50/30 dark:bg-blue-950/20 border-blue-200/50 dark:border-blue-800/50' : 'bg-muted/20'
            }`}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    {comm.contact_role === 'INTERNAL' ? (
                      <><Users className="w-3 h-3 text-blue-500" /> Staff Note {comm.author_name ? `(${comm.author_name})` : ''}</>
                    ) : (
                      <><User className="w-3 h-3 text-green-500" /> Parent Contact {comm.author_name ? `(${comm.author_name})` : ''}</>
                    )}
                  </p>
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
        <h4 className="text-sm font-medium">
          {commsType === 'parent' ? 'Log Parent Communication' : 'Add Internal Staff Note'}
        </h4>

        {commsType === 'parent' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Contact Name</Label>
              <input
                type="text"
                placeholder="e.g. Jane Doe (Mother)"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contact Role</Label>
              <Select value={contactRole} onValueChange={(v) => setContactRole(v ?? 'PARENT')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARENT">Parent</SelectItem>
                  <SelectItem value="GUARDIAN">Guardian</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {commsType === 'internal' && (
          <p className="text-xs text-muted-foreground">
            Internal notes are visible to all staff who can access this case.
          </p>
        )}

        <Textarea
          placeholder={commsType === 'parent' ? "Type message to parent/guardian..." : "Type internal staff note..."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSubmit} disabled={!message.trim() || isSubmitting}>
            {isSubmitting ? 'Sending...' : commsType === 'parent' ? 'Log Communication' : 'Add Note'}
            <Send className="ml-2 w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
