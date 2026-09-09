'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { CalendarClock, Loader2 } from 'lucide-react';

interface Appointment {
  appointment_id: string;
  type: string;
  status: string;
  scheduled_at: string | null;
  location: 'online' | 'offline' | null;
  notes: string | null;
  created_for: string;
  student_id: string | null;
  counselor_id: string | null;
  psychologist_id: string | null;
}

type MediateForm = {
  status: 'pending' | 'confirmed' | 'cancelled';
  scheduled_at: string;
  location: 'online' | 'offline';
  notes: string;
};

const emptyMediate: MediateForm = { status: 'pending', scheduled_at: '', location: 'online', notes: '' };

export default function SchoolNurseDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [mediate, setMediate] = useState<MediateForm>(emptyMediate);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const res = await apiClient<Appointment[]>('/appointments?type=student');
    if (res.success && res.data) setAppointments(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openMediate = (appt: Appointment) => {
    setSelected(appt);
    setMediate({
      status: (appt.status as MediateForm['status']) || 'pending',
      scheduled_at: appt.scheduled_at ? appt.scheduled_at.slice(0, 16) : '',
      location: appt.location ?? 'online',
      notes: appt.notes ?? '',
    });
  };

  const handleMediate = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await apiClient(`/appointments/${selected.appointment_id}/mediate`, {
      method: 'PATCH',
      body: {
        status: mediate.status,
        location: mediate.location,
        notes: mediate.notes,
        scheduled_at: mediate.scheduled_at ? (() => {
          const [date, time] = mediate.scheduled_at.split('T');
          const [year, month, day] = date.split('-').map(Number);
          const [hour, minute] = time.split(':').map(Number);
          return new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString();
        })() : null,
      },
    });
    setSaving(false);
    if (res.success) {
      toast.success('Jadwal diperbarui');
      fetchData();
    } else {
      toast.error(res.error ?? 'Gagal');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dashboard School Nurse
        </h1>
        <p className="text-muted-foreground mt-1">
          Mediasi jadwal konseling antara psikolog, orang tua, dan siswa.
        </p>
      </div>

      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle>Daftar Janji Temu Konseling</CardTitle>
          <CardDescription>Semua janji temu siswa yang perlu dimonitor dan dimediasi.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada janji temu.</p>
          ) : (
            <div className="space-y-3">
              {appointments.map(a => (
                <div key={a.appointment_id} className="flex items-start justify-between border rounded p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Siswa ID: {a.student_id?.slice(0, 8) ?? '-'}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.scheduled_at ? formatInTimeZone(new Date(a.scheduled_at), 'Asia/Jakarta', 'dd MMM yyyy HH:mm', { locale: id }) : 'Belum dijadwalkan'}
                    </p>
                    {a.location && <p className="text-xs text-muted-foreground capitalize">Lokasi: {a.location}</p>}
                    <div className="flex gap-2 flex-wrap">
                      <Badge className={`text-[10px] ${a.status === 'confirmed' ? 'bg-green-100 text-green-800' : a.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{a.status}</Badge>
                      {a.psychologist_id && <Badge variant="outline" className="text-[10px]">Psikolog</Badge>}
                      {a.counselor_id && <Badge variant="outline" className="text-[10px]">Konselor</Badge>}
                    </div>
                  </div>
                  <Dialog>
                    <DialogTrigger render={<Button size="sm" variant="outline">Mediasi / Ubah Jadwal</Button>} />
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Mediasi Jadwal</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <p className="text-xs text-muted-foreground">Appointment ID: {a.appointment_id}</p>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select value={mediate.status} onValueChange={(v) => setMediate({ ...mediate, status: v as MediateForm['status'] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Tanggal/Waktu</Label>
                          <input type="datetime-local" className="border rounded p-2 w-full" value={mediate.scheduled_at} onChange={e => setMediate({ ...mediate, scheduled_at: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Lokasi</Label>
                          <Select value={mediate.location} onValueChange={(v) => setMediate({ ...mediate, location: v as MediateForm['location'] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="online">Online</SelectItem>
                              <SelectItem value="offline">Offline</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Catatan Mediasi</Label>
                          <Textarea value={mediate.notes} onChange={e => setMediate({ ...mediate, notes: e.target.value })} rows={3} />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => { }}>Cancel</Button>
                        <Button onClick={handleMediate} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
