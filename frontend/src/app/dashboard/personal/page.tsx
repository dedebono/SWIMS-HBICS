'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { CalendarClock, Loader2, Plus } from 'lucide-react';

interface Appointment {
  appointment_id: string;
  type: string;
  status: string;
  scheduled_at: string | null;
  location: 'online' | 'offline' | null;
  notes: string | null;
  created_for: string;
}

interface CounselorOption {
  user_id: string;
  full_name: string;
  gender: string;
}

type FormState = {
  counselor_id: string;
  location: 'online' | 'offline';
  notes: string;
};

const emptyForm: FormState = { counselor_id: '', location: 'online', notes: '' };

export default function PersonalDashboardPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [counselors, setCounselors] = useState<CounselorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [creating, setCreating] = useState(false);

  const isMale = (user?.gender ?? '').toLowerCase() === 'male';

  const fetchData = async () => {
    setLoading(true);
    const [apptRes, counselorRes] = await Promise.all([
      apiClient<Appointment[]>(`/appointments?type=personal&created_for=${user?.user_id}`),
      apiClient<CounselorOption[]>(`/appointments/counselors`),
    ]);
    if (apptRes.success && apptRes.data) setAppointments(apptRes.data);
    if (counselorRes.success && counselorRes.data) setCounselors(counselorRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user?.user_id]);

  const handleCreate = async () => {
    if (!form.counselor_id) { toast.error('Pilih konselor'); return; }
    setCreating(true);
    const res = await apiClient('/appointments/personal', {
      method: 'POST',
      body: form,
    });
    setCreating(false);
    if (res.success) {
      toast.success('Janji temu ke konselor dibuat');
      setDialogOpen(false);
      setForm(emptyForm);
      fetchData();
    } else {
      toast.error(res.error ?? 'Gagal membuat janji temu');
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const eligibleCounselors = counselors.filter(c => !isMale || c.gender.toLowerCase() === 'male');

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Personal</h1>
          <p className="text-muted-foreground text-sm">
            Buat janji temu konseling dengan konselor internal.
            {isMale ? ' Kamu hanya bisa memilih konselor dengan gender sama.' : ''}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button className="gap-2"><Plus className="w-4 h-4" /> Buat Janji Temu</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buat Janji Temu Konseling</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Konselor</Label>
                <Select value={form.counselor_id} onValueChange={(v) => setForm({ ...form, counselor_id: v as string })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih konselor" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleCounselors.map(c => (
                      <SelectItem key={c.user_id} value={c.user_id}>{c.full_name} ({c.gender})</SelectItem>
                    ))}
                    {eligibleCounselors.length === 0 && <SelectItem value="" disabled>Tidak ada konselor tersedia</SelectItem>}
                  </SelectContent>
                </Select>
                {isMale && counselors.length > 0 && (
                  <p className="text-xs text-muted-foreground">Hanya menampilkan konselor dengan gender male sesuai aturan.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Lokasi</Label>
                <Select value={form.location} onValueChange={(v) => setForm({ ...form, location: v as 'online' | 'offline' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Catatan</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Opsional" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>{creating ? 'Menyimpan...' : 'Simpan'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle>Janji Temu Saya</CardTitle>
          <CardDescription>Daftar janji temu konseling Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada janji temu.</p>
          ) : (
            <div className="space-y-3">
              {appointments.map(a => (
                <div key={a.appointment_id} className="flex items-center justify-between border rounded p-3">
                  <div>
                    <p className="text-sm font-medium">Konseling Personal</p>
                    <p className="text-xs text-muted-foreground">
                      {a.scheduled_at ? format(new Date(a.scheduled_at), 'dd MMM yyyy HH:mm', { locale: id }) : 'Belum dijadwalkan'}
                    </p>
                    {a.location && <p className="text-xs text-muted-foreground capitalize">{a.location}</p>}
                    <Badge className={`mt-1 text-[10px] ${statusColor(a.status)}`}>{a.status}</Badge>
                  </div>
                  {a.notes && <p className="text-xs text-muted-foreground max-w-[200px] line-clamp-2">{a.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
