"use client";

import { useEffect, useState } from "react";
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { localDatetimeToUTC } from "@/lib/utils";
import { toast } from "sonner";
import { Calendar, Clock, User, Plus } from "lucide-react";

interface Appointment {
  appointment_id: string;
  type: "student" | "personal";
  status: string;
  scheduled_at: string | null;
  location: string | null;
  notes: string | null;
  created_for: string;
  student_id?: string | null;
}

interface AvailabilitySlot {
  slot_id: string;
  slot_start: string;
  slot_end: string;
  is_available: boolean;
  appointment_id?: string | null;
  repeat_pattern?: string | null;
  repeat_day?: number | null;
  parent_slot_id?: string | null;
}

export default function PsychologistDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [slotForm, setSlotForm] = useState({ slot_start: "", slot_end: "" });
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatPattern, setRepeatPattern] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [repeatWeeks, setRepeatWeeks] = useState<1 | 2 | 3 | 4>(1);
  const [noteForm, setNoteForm] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const user = (typeof window !== 'undefined') ? JSON.parse(localStorage.getItem('swims_user') || '{}') : {};
    const apptRes = await apiClient<Appointment[]>(`/appointments?psychologist_id=${user.user_id}&type=student`);
    const availRes = await apiClient<any[]>(`/availability/${user.user_id}`);
    if (apptRes.success && apptRes.data) setAppointments(apptRes.data);
    if (availRes.success && availRes.data) setAvailability(availRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('swims_user') || '{}');
    const payload: Record<string, unknown> = {
      slot_start: localDatetimeToUTC(slotForm.slot_start),
      slot_end: localDatetimeToUTC(slotForm.slot_end),
    };
    if (repeatEnabled) {
      payload.repeat_pattern = repeatPattern;
      payload.repeat_weeks = repeatWeeks;
    }
    const res = await apiClient('/availability', { method: 'POST', body: payload });
    if (res.success) {
      toast.success(repeatEnabled ? 'Slot berulang ditambahkan' : 'Slot tersedia ditambahkan');
      setSlotForm({ slot_start: '', slot_end: '' });
      setRepeatEnabled(false);
      fetchData();
    } else {
      toast.error(res.error ?? 'Gagal');
    }
  };

  const handleConfirmAppointment = async (appointmentId: string) => {
    const slot = availability.find(a => a.is_available && !a.appointment_id);
    if (!slot) { toast.error('Tidak ada slot tersedia'); return; }
    const res = await apiClient(`/appointments/${appointmentId}/confirm`, { method: 'POST', body: { scheduled_at: slot.slot_start } });
    if (res.success) { toast.success('Janji temu dikonfirmasi'); fetchData(); }
    else { toast.error(res.error ?? 'Gagal'); }
  };

  const handleSaveNotes = async (appointmentId: string) => {
    const notes = noteForm[appointmentId] ?? '';
    setSavingNote(appointmentId);
    const res = await apiClient(`/appointments/${appointmentId}/notes`, { method: 'PATCH', body: { notes } });
    setSavingNote(null);
    if (res.success) { toast.success('Catatan disimpan'); fetchData(); }
    else { toast.error(res.error ?? 'Gagal'); }
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

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Psikolog</h1>
          <p className="text-muted-foreground">Kelola janji temu dan ketersediaan.</p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>Refresh</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Janji Temu Aktif</CardTitle>
            <Calendar className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{appointments.filter(a => a.status !== 'cancelled' && a.status !== 'completed').length}</div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Slot Tersedia</CardTitle>
            <Clock className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{availability.filter(a => a.is_available).length}</div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Menunggu Konfirmasi</CardTitle>
            <User className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{appointments.filter(a => a.status === 'pending').length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Availability Form */}
      <Card className="glass">
        <CardHeader>
          <CardTitle>Tambah Ketersediaan</CardTitle>
          <CardDescription>Tambah slot waktu yang tersedia untuk janji temu.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddAvailability} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="datetime-local" className="border rounded p-2" value={slotForm.slot_start} onChange={e => setSlotForm({ ...slotForm, slot_start: e.target.value })} required />
              <input type="datetime-local" className="border rounded p-2" value={slotForm.slot_end} onChange={e => setSlotForm({ ...slotForm, slot_end: e.target.value })} required />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={repeatEnabled} onChange={e => setRepeatEnabled(e.target.checked)} className="accent-primary" />
                Berulang
              </label>
              {repeatEnabled && (
                <>
                  <select className="border rounded p-1.5 text-sm" value={repeatPattern} onChange={e => setRepeatPattern(e.target.value as 'weekly' | 'biweekly' | 'monthly')}>
                    <option value="weekly">Mingguan</option>
                    <option value="biweekly">Dua Mingguan</option>
                    <option value="monthly">Bulanan</option>
                  </select>
                  {repeatPattern === 'biweekly' && (
                    <select className="border rounded p-1.5 text-sm" value={repeatWeeks} onChange={e => setRepeatWeeks(Number(e.target.value) as 1 | 2 | 3 | 4)}>
                      <option value={1}>Setiap 1 minggu</option>
                      <option value={2}>Setiap 2 minggu</option>
                      <option value={3}>Setiap 3 minggu</option>
                      <option value={4}>Setiap 4 minggu</option>
                    </select>
                  )}
                </>
              )}
            </div>
            <Button type="submit" className="gap-2 self-start"><Plus className="w-4 h-4" /> {repeatEnabled ? 'Tambah Berulang' : 'Tambah'}</Button>
          </form>
        </CardContent>
      </Card>

      {/* Appointments List */}
      <Card className="glass">
        <CardHeader>
          <CardTitle>Daftar Janji Temu</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Memuat...</p> : (
            <div className="space-y-3">
              {appointments.map(a => (
                <div key={a.appointment_id} className="flex flex-col gap-2 border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium capitalize">{a.type === 'student' ? 'Siswa' : 'Personal'}</p>
                      <p className="text-xs text-muted-foreground">{a.scheduled_at ? formatInTimeZone(new Date(a.scheduled_at), 'Asia/Jakarta', 'dd MMM yyyy HH:mm', { locale: id }) : 'Belum dijadwalkan'}</p>
                      {a.location && <p className="text-xs text-muted-foreground capitalize">{a.location}</p>}
                      <Badge className={`mt-1 text-[10px] ${statusColor(a.status)}`}>{a.status}</Badge>
                    </div>
                    {a.status === 'awaiting_psychologist_availability' && (
                      <Button size="sm" onClick={() => handleConfirmAppointment(a.appointment_id)}>Pilih Slot & Konfirmasi</Button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs">Catatan Hasil Pertemuan</Label>
                    <Textarea
                      className="text-xs"
                      rows={2}
                      placeholder="Tulis catatan..."
                      value={noteForm[a.appointment_id] ?? a.notes ?? ''}
                      onChange={(e) => setNoteForm(prev => ({ ...prev, [a.appointment_id]: e.target.value }))}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => handleSaveNotes(a.appointment_id)} disabled={savingNote === a.appointment_id}>
                        {savingNote === a.appointment_id ? 'Menyimpan...' : 'Simpan Catatan'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {appointments.length === 0 && <p className="text-sm text-muted-foreground">Belum ada janji temu.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
