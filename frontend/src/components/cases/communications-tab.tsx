'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { IconBox } from '@/components/ui/icon-box';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
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

const CHANNEL_LABEL: Record<string, string> = {
  PHONE: 'Telepon',
  EMAIL: 'Surel',
  IN_PERSON: 'Tatap muka',
  APP: 'Aplikasi',
  INTERNAL: 'Internal',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const filteredComms = comms.filter((c) => {
    if (commsType === 'parent') return c.contact_role === 'PARENT' || c.contact_role === 'GUARDIAN';
    return c.contact_role === 'TEACHER' || c.contact_role === 'INTERNAL';
  });

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setIsSubmitting(true);

    const body: Record<string, unknown> = { message };

    if (commsType === 'parent') {
      if (!contactName.trim()) {
        toast.error('Mohon isi nama orang tua atau wali.');
        setIsSubmitting(false);
        return;
      }
      body.contact_name = contactName.trim();
      body.contact_role = contactRole;
      body.channel = 'IN_PERSON';
    } else {
      body.contact_name = `${user?.full_name || 'Staf'} (Catatan Internal)`;
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
      toast.success('Catatan komunikasi berhasil disimpan.');
    } else {
      toast.error(res.error || 'Gagal menyimpan catatan komunikasi.');
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs
        value={commsType}
        onValueChange={(v) => setCommsType((v as 'parent' | 'internal') ?? 'parent')}
      >
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="parent">
              <User className="size-4" />
              Orang Tua / Wali
            </TabsTrigger>
            <TabsTrigger value="internal">
              <Users className="size-4" />
              Catatan Internal
            </TabsTrigger>
          </TabsList>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={fetchComms}
            disabled={isLoading}
            aria-label="Muat ulang catatan komunikasi"
            title="Muat ulang"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>

        <TabsContent value="parent" className="space-y-4">
          {filteredComms.length === 0 ? (
            <Card>
              <EmptyState
                icon={<MessageSquare />}
                title="Belum ada komunikasi"
                description="Catatan komunikasi dengan orang tua atau wali akan tampil di sini."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredComms.map((comm) => (
                <Card key={comm.comm_id}>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border">
                    <div className="flex items-center gap-3">
                      <IconBox tone="green" size="sm">
                        <User />
                      </IconBox>
                      <div>
                        <CardTitle className="text-sm">Kontak Orang Tua / Wali</CardTitle>
                        <CardDescription>
                          {comm.contact_name}
                          {comm.author_name ? ` • dicatat oleh ${comm.author_name}` : ''}
                        </CardDescription>
                      </div>
                    </div>
                    <StatusBadge
                      tone="success"
                      label={CHANNEL_LABEL[comm.channel?.toUpperCase()] ?? comm.channel ?? 'Internal'}
                    />
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm text-secondary-text">{comm.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(comm.created_at)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="internal" className="space-y-4">
          {filteredComms.length === 0 ? (
            <Card>
              <EmptyState
                icon={<MessageSquare />}
                title="Belum ada catatan internal"
                description="Catatan antar staf yang dapat dilihat seluruh tim kasus akan tampil di sini."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredComms.map((comm) => (
                <Card key={comm.comm_id}>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border">
                    <div className="flex items-center gap-3">
                      <IconBox tone="blue" size="sm">
                        <ShieldCheck />
                      </IconBox>
                      <div>
                        <CardTitle className="text-sm">Catatan Staf</CardTitle>
                        <CardDescription>
                          {comm.author_name ? `oleh ${comm.author_name}` : 'Dokumentasi internal tim'}
                        </CardDescription>
                      </div>
                    </div>
                    <StatusBadge tone="info" label="Internal" />
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm text-secondary-text">{comm.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(comm.created_at)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Tambah catatan baru */}
      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>
            {commsType === 'parent' ? 'Catat Komunikasi Orang Tua' : 'Tambah Catatan Internal Staf'}
          </CardTitle>
          <CardDescription>
            {commsType === 'parent'
              ? 'Catat hasil komunikasi dengan orang tua atau wali pada kasus ini.'
              : 'Catatan internal dapat dilihat semua staf yang memiliki akses ke kasus ini.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {commsType === 'parent' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="comm-contact-name" className="text-xs font-semibold">
                  Nama Kontak
                </Label>
                <Input
                  id="comm-contact-name"
                  placeholder="Contoh: Ibu Ratih (Ibu)"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Hubungan</Label>
                <Select value={contactRole} onValueChange={(v) => setContactRole(v ?? 'PARENT')}>
                  <SelectTrigger aria-label="Hubungan kontak">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PARENT">Orang Tua</SelectItem>
                    <SelectItem value="GUARDIAN">Wali</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-border bg-primary-softer px-3 py-2 text-xs text-secondary-text">
              <ShieldCheck className="size-4 text-primary" />
              Catatan internal hanya dapat dilihat staf yang memiliki akses ke kasus ini.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="comm-message" className="text-xs font-semibold">
              Isi Catatan
            </Label>
            <Textarea
              id="comm-message"
              placeholder={
                commsType === 'parent'
                  ? 'Tuliskan ringkasan komunikasi dengan orang tua atau wali...'
                  : 'Tuliskan catatan internal untuk fellow staf...'
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={!message.trim() || isSubmitting}>
              <Send className="size-4" />
              {isSubmitting
                ? 'Menyimpan...'
                : commsType === 'parent'
                  ? 'Simpan Komunikasi'
                  : 'Simpan Catatan'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}