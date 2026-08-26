'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Eye, CalendarPlus } from 'lucide-react';

interface StaffSubmission {
  submission_id: string;
  staff_user_id: string;
  total_score: number;
  recommendation: 'professional' | 'internal';
  answers: Array<{ question_id: string; answer_text?: string; score: number }>;
  status: 'new' | 'reviewed' | 'scheduled' | 'closed';
  counselor_notes: string | null;
  created_at: string;
  staff_name: string;
  staff_gender: string;
  staff_email: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  new: 'Baru',
  reviewed: 'Ditinjau',
  scheduled: 'Dijadwalkan',
  closed: 'Ditutup',
};

export default function StaffQuisionerCounselorPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [subs, setSubs] = useState<StaffSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StaffSubmission | null>(null);
  const [status, setStatus] = useState<string>('new');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMeeting, setShowMeeting] = useState(false);
  const [meeting, setMeeting] = useState({ location: 'offline', scheduled_at: '', notes: '' });
  const [meetingSaving, setMeetingSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await apiClient<StaffSubmission[]>('/counselor/staff-submissions');
    if (res.success && res.data) setSubs(res.data);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.role === 'COUNSELOR' || user?.role === 'PSYCHOLOGIST') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const openDetail = async (id: string) => {
    const res = await apiClient<StaffSubmission>(`/counselor/staff-submissions/${id}`);
    if (res.success && res.data) {
      setSelected(res.data);
      setStatus(res.data.status);
      setNotes(res.data.counselor_notes || '');
      setShowMeeting(false);
      setMeeting({ location: 'offline', scheduled_at: '', notes: '' });
    }
  };

  const saveDetail = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await apiClient(`/counselor/staff-submissions/${selected.submission_id}`, {
      method: 'PATCH',
      body: { status, counselor_notes: notes },
    });
    setSaving(false);
    if (res.success) {
      toast.success('Disimpan');
      setSelected({ ...selected, status: status as StaffSubmission['status'], counselor_notes: notes });
      load();
    } else {
      toast.error(res.error ?? 'Gagal menyimpan');
    }
  };

  const createMeeting = async () => {
    if (!selected) return;
    setMeetingSaving(true);
    const res = await apiClient(`/counselor/staff-submissions/${selected.submission_id}/meeting`, {
      method: 'POST',
      body: {
        counselor_id: user?.user_id,
        location: meeting.location,
        notes: meeting.notes,
        scheduled_at: meeting.scheduled_at || undefined,
      },
    });
    setMeetingSaving(false);
    if (res.success) {
      toast.success('Pertemuan dibuat & notifikasi dikirim ke staff');
      setShowMeeting(false);
      setSelected(null);
      load();
    } else {
      toast.error(res.error ?? 'Gagal membuat pertemuan');
    }
  };

  if (authLoading) {
    return <div className="p-6 text-muted-foreground">Memuat...</div>;
  }
  if (user?.role !== 'COUNSELOR' && user?.role !== 'PSYCHOLOGIST') {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Halaman ini hanya untuk Konselor / Psikolog.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Quisioner Staff</h1>
        <p className="text-muted-foreground">Tinjau hasil quisioner kesejahteraan staff dan jadwalkan pertemuan konseling.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Pengajuan</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          ) : subs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pengajuan quisioner staff.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="p-2">Staff</th>
                    <th className="p-2">Gender</th>
                    <th className="p-2">Skor</th>
                    <th className="p-2">Rekomendasi</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Tanggal</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.submission_id} className="border-b">
                      <td className="p-2 font-medium">{s.staff_name}</td>
                      <td className="p-2">{s.staff_gender === 'male' ? 'L' : s.staff_gender === 'female' ? 'P' : '-'}</td>
                      <td className="p-2">{s.total_score}</td>
                      <td className="p-2">
                        <Badge className={s.recommendation === 'professional' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
                          {s.recommendation === 'professional' ? 'Profesional' : 'Internal'}
                        </Badge>
                      </td>
                      <td className="p-2">{STATUS_LABEL[s.status]}</td>
                      <td className="p-2 text-muted-foreground">{new Date(s.created_at).toLocaleString('id-ID')}</td>
                      <td className="p-2">
                        <Button size="sm" variant="outline" onClick={() => openDetail(s.submission_id)}>
                          <Eye className="h-4 w-4" /> Detail
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && !showMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Detail Quisioner — {selected.staff_name}</CardTitle>
              <CardDescription>
                {selected.staff_email} · Skor {selected.total_score} ·{' '}
                <span className={selected.recommendation === 'professional' ? 'text-red-600' : 'text-green-600'}>
                  {selected.recommendation === 'professional' ? 'Rekomendasi Profesional' : 'Rekomendasi Internal'}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium">Jawaban</p>
                {selected.answers.map((a, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{a.answer_text || '(teks)'}</span>
                    <Badge variant="outline">{a.score}</Badge>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select id="status" className="border rounded p-2 w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="new">Baru</option>
                  <option value="reviewed">Ditinjau</option>
                  <option value="scheduled">Dijadwalkan</option>
                  <option value="closed">Ditutup</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Catatan Konselor</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>

              <div className="flex gap-2">
                <Button onClick={saveDetail} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
                <Button variant="default" onClick={() => setShowMeeting(true)}>
                  <CalendarPlus className="h-4 w-4" /> Buat Pertemuan
                </Button>
                <Button variant="outline" onClick={() => setSelected(null)}>Tutup</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {selected && showMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowMeeting(false)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Buat Pertemuan Konseling</CardTitle>
              <CardDescription>Untuk staff: {selected.staff_name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Lokasi</Label>
                <select className="border rounded p-2 w-full" value={meeting.location} onChange={(e) => setMeeting({ ...meeting, location: e.target.value })}>
                  <option value="offline">Tatap Muka (Offline)</option>
                  <option value="online">Online</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sched">Waktu Pertemuan (opsional)</Label>
                <Input id="sched" type="datetime-local" value={meeting.scheduled_at} onChange={(e) => setMeeting({ ...meeting, scheduled_at: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mnotes">Catatan Pertemuan</Label>
                <Textarea id="mnotes" value={meeting.notes} onChange={(e) => setMeeting({ ...meeting, notes: e.target.value })} rows={3} />
              </div>
              <div className="flex gap-2">
                <Button onClick={createMeeting} disabled={meetingSaving}>{meetingSaving ? 'Membuat...' : 'Buat & Kirim Notifikasi'}</Button>
                <Button variant="outline" onClick={() => setShowMeeting(false)}>Batal</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
