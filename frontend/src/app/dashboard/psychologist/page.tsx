"use client";

import { useEffect, useState } from "react";
import { id as idLocale } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { IconBox } from "@/components/ui/icon-box";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, severityTone } from "@/components/ui/status-badge";
import {
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { localDatetimeToUTC } from "@/lib/utils";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarDays,
  Clock,
  MapPin,
  NotebookPen,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";

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

const repeatLabels: Record<string, string> = {
  weekly: "Mingguan",
  biweekly: "Dua mingguan",
  monthly: "Bulanan",
};

const appointmentStatusLabel = (status: string): string => {
  switch (status.toLowerCase()) {
    case "confirmed":
      return "Dikonfirmasi";
    case "pending":
      return "Menunggu konfirmasi";
    case "cancelled":
      return "Dibatalkan";
    case "completed":
      return "Selesai";
    case "awaiting_psychologist_availability":
      return "Menunggu slot psikolog";
    default:
      return status;
  }
};

const formatSlotDate = (value: string) =>
  formatInTimeZone(new Date(value), 'Asia/Jakarta', 'dd MMM yyyy', { locale: idLocale });

const formatSlotTime = (start: string, end: string) =>
  `${formatInTimeZone(new Date(start), 'Asia/Jakarta', 'HH:mm')} – ${formatInTimeZone(new Date(end), 'Asia/Jakarta', 'HH:mm')}`;

export default function PsychologistDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotForm, setSlotForm] = useState({ slot_start: "", slot_end: "" });
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatPattern, setRepeatPattern] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [repeatWeeks, setRepeatWeeks] = useState<1 | 2 | 3 | 4>(1);
  const [noteForm, setNoteForm] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingAppointment, setViewingAppointment] = useState<Appointment | null>(null);
  const [viewingSlot, setViewingSlot] = useState<AvailabilitySlot | null>(null);
  const [apptLoading, setApptLoading] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveSlot, setMoveSlot] = useState<AvailabilitySlot | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveTargetSlotId, setMoveTargetSlotId] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const user = (typeof window !== 'undefined') ? JSON.parse(localStorage.getItem('swims_user') || '{}') : {};
    const apptRes = await apiClient<Appointment[]>(`/appointments?psychologist_id=${user.user_id}&type=student`);
    const availRes = await apiClient<AvailabilitySlot[]>(`/availability/${user.user_id}`);
    if (apptRes.success && apptRes.data) setAppointments(apptRes.data);
    if (availRes.success && availRes.data) setAvailability(availRes.data);
    setLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      await fetchData();
    };
    void load();
  }, []);

  const handleAddAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
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
      toast.error(res.error ?? 'Gagal menambah slot.');
    }
  };

  const handleConfirmAppointment = async (appointmentId: string) => {
    const slot = availability.find(a => a.is_available && !a.appointment_id);
    if (!slot) { toast.error('Tidak ada slot tersedia'); return; }
    const res = await apiClient(`/appointments/${appointmentId}/confirm`, { method: 'POST', body: { scheduled_at: slot.slot_start } });
    if (res.success) { toast.success('Janji temu dikonfirmasi'); fetchData(); }
    else { toast.error(res.error ?? 'Gagal mengonfirmasi janji temu.'); }
  };

  const handleSaveNotes = async (appointmentId: string) => {
    const notes = noteForm[appointmentId] ?? '';
    setSavingNote(appointmentId);
    const res = await apiClient(`/appointments/${appointmentId}/notes`, { method: 'PATCH', body: { notes } });
    setSavingNote(null);
    if (res.success) { toast.success('Catatan disimpan'); fetchData(); }
    else { toast.error(res.error ?? 'Gagal menyimpan catatan.'); }
  };

  const handleViewAppointment = async (appointmentId: string) => {
    setApptLoading(true);
    const res = await apiClient<Appointment>(`/appointments/${appointmentId}`);
    setApptLoading(false);
    if (res.success && res.data) {
      setViewingAppointment(res.data);
      const slot = availability.find(a => a.appointment_id === appointmentId);
      setViewingSlot(slot ?? null);
      setViewDialogOpen(true);
    } else {
      toast.error('Gagal memuat detail janji temu.');
    }
  };

  const confirmMoveSlot = async () => {
    if (!moveSlot || !moveTargetSlotId) { toast.error('Pilih slot tujuan terlebih dahulu.'); return; }
    setMoveLoading(true);
    const res = await apiClient(`/appointments/${moveSlot.appointment_id}/reschedule`, {
      method: 'PATCH',
      body: { new_slot_id: moveTargetSlotId, old_slot_id: moveSlot.slot_id },
    });
    setMoveLoading(false);
    setMoveDialogOpen(false);
    setMoveSlot(null);
    setMoveTargetSlotId('');
    if (res.success) { toast.success('Janji temu dipindahkan.'); fetchData(); }
    else { toast.error(res.error ?? 'Gagal memindahkan janji temu.'); }
  };

  const confirmDeleteSlot = async () => {
    if (!slotToDelete) return;
    setDeleteLoading(true);
    const res = await apiClient(`/availability/${slotToDelete}`, { method: 'DELETE' });
    setDeleteLoading(false);
    setDeleteDialogOpen(false);
    setSlotToDelete(null);
    if (res.success) { toast.success('Slot dihapus'); fetchData(); }
    else { toast.error('Gagal menghapus slot'); }
  };

  const activeAppointments = appointments.filter(a => a.status !== 'cancelled' && a.status !== 'completed');
  const pendingAppointments = appointments.filter(a => a.status === 'pending' || a.status === 'awaiting_psychologist_availability');
  const sortedSlots = availability
    .slice()
    .sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime());
  const freeSlots = sortedSlots.filter(s => s.is_available && !s.appointment_id);
  const movableSlots = freeSlots.filter(s => s.slot_id !== moveSlot?.slot_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dasbor Psikolog"
        description="Kelola janji temu siswa, ketersediaan jadwal, dan catatan hasil pertemuan."
        actions={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Muat ulang
          </Button>
        }
      />

      {/* Statistik */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Janji Temu Aktif"
          value={activeAppointments.length}
          hint="Belum selesai atau dibatalkan"
          icon={<CalendarDays className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Slot Tersedia"
          value={availability.filter(a => a.is_available).length}
          hint={`${freeSlots.length} slot masih kosong`}
          icon={<Clock className="size-5" />}
          iconTone="green"
          progress={
            availability.length > 0
              ? Math.round((freeSlots.length / availability.length) * 100)
              : 0
          }
          progressLabel="Rasio slot kosong"
        />
        <StatCard
          label="Menunggu Konfirmasi"
          value={pendingAppointments.length}
          hint="Perlu tindakan Anda"
          icon={<UserRound className="size-5" />}
          iconTone="yellow"
          trend={pendingAppointments.length > 0 ? "up" : "flat"}
          trendLabel={pendingAppointments.length > 0 ? "Perlu diproses" : "Semua beres"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Tambah ketersediaan */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Tambah Ketersediaan</CardTitle>
            <CardDescription>Tambahkan slot waktu yang tersedia untuk janji temu.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddAvailability} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="psy-slot-start">Mulai</Label>
                <Input
                  id="psy-slot-start"
                  type="datetime-local"
                  value={slotForm.slot_start}
                  onChange={e => setSlotForm({ ...slotForm, slot_start: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="psy-slot-end">Selesai</Label>
                <Input
                  id="psy-slot-end"
                  type="datetime-local"
                  value={slotForm.slot_end}
                  onChange={e => setSlotForm({ ...slotForm, slot_end: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="psy-repeat">Pola Berulang</Label>
                <div className="flex h-10 items-center gap-2.5 rounded-[10px] border border-input bg-card px-3.5">
                  <Switch
                    id="psy-repeat"
                    checked={repeatEnabled}
                    onCheckedChange={(checked) => setRepeatEnabled(checked as boolean)}
                  />
                  <span className="text-sm text-secondary-text">
                    {repeatEnabled ? repeatLabels[repeatPattern] : "Tidak berulang"}
                  </span>
                </div>
              </div>
              {repeatEnabled && (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(['weekly', 'biweekly', 'monthly'] as const).map((pattern) => (
                      <button
                        key={pattern}
                        type="button"
                        onClick={() => setRepeatPattern(pattern)}
                        aria-pressed={repeatPattern === pattern}
                        className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                          repeatPattern === pattern
                            ? 'border-primary/30 bg-primary-softer text-primary'
                            : 'border-border bg-card text-secondary-text hover:bg-primary-softer'
                        }`}
                      >
                        {repeatLabels[pattern]}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="psy-weeks">Interval Minggu</Label>
                    <select
                      id="psy-weeks"
                      className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm text-card-foreground outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                      value={repeatWeeks}
                      disabled={repeatPattern !== 'biweekly'}
                      onChange={e => setRepeatWeeks(Number(e.target.value) as 1 | 2 | 3 | 4)}
                    >
                      <option value={1}>Setiap 1 minggu</option>
                      <option value={2}>Setiap 2 minggu</option>
                      <option value={3}>Setiap 3 minggu</option>
                      <option value={4}>Setiap 4 minggu</option>
                    </select>
                  </div>
                </>
              )}
              <Button type="submit" className="w-full gap-2">
                <Plus className="size-4" />
                {repeatEnabled ? "Tambah Slot Berulang" : "Tambah Slot"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Daftar ketersediaan */}
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Daftar Ketersediaan</CardTitle>
            <CardDescription>Slot waktu yang Anda tambahkan untuk pemesanan.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center gap-2.5 py-8">
                <span className="size-4 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
                <p className="text-sm text-muted-foreground">Memuat slot…</p>
              </div>
            ) : sortedSlots.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="size-6" />}
                title="Belum ada slot ketersediaan"
                description="Tambahkan slot waktu Anda di sebelah kiri agar siswa dapat membuat janji temu."
              />
            ) : (
              <DataTable>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell scope="col">Tanggal</TableHeaderCell>
                    <TableHeaderCell scope="col">Waktu</TableHeaderCell>
                    <TableHeaderCell scope="col">Status</TableHeaderCell>
                    <TableHeaderCell scope="col">Pola</TableHeaderCell>
                    <TableHeaderCell scope="col" className="text-right">Aksi</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedSlots.map((a) => (
                    <TableRow key={a.slot_id}>
                      <TableCell className="text-sm font-semibold text-heading">
                        {formatSlotDate(a.slot_start)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatSlotTime(a.slot_start, a.slot_end)}
                      </TableCell>
                      <TableCell>
                        {a.appointment_id ? (
                          <StatusBadge tone="warning" label="Dipesan" />
                        ) : a.is_available ? (
                          <StatusBadge tone="success" label="Tersedia" />
                        ) : (
                          <StatusBadge tone="neutral" label="Tidak tersedia" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.repeat_pattern ? repeatLabels[a.repeat_pattern] ?? a.repeat_pattern : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.appointment_id ? (
                          <div className="inline-flex gap-2">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => handleViewAppointment(a.appointment_id!)}
                            >
                              Lihat
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => { setMoveSlot(a); setMoveTargetSlotId(''); setMoveDialogOpen(true); }}
                            >
                              Pindahkan
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-danger hover:bg-danger-soft"
                            onClick={() => { setSlotToDelete(a.slot_id); setDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="size-3.5" />
                            Hapus
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              Total {sortedSlots.length} slot · {freeSlots.length} slot kosong
            </p>
          </CardFooter>
        </Card>
      </div>

      {/* Daftar janji temu */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Janji Temu</CardTitle>
          <CardDescription>
            Konfirmasi jadwal, perbarui waktu, dan catat hasil pertemuan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2.5 py-8">
              <span className="size-4 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
              <p className="text-sm text-muted-foreground">Memuat janji temu…</p>
            </div>
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-6" />}
              title="Belum ada janji temu"
              description="Janji temu yang dibuat siswa akan otomatis muncul di daftar ini."
            />
          ) : (
            <div className="space-y-4">
              {appointments.map((a) => (
                <div
                  key={a.appointment_id}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <IconBox tone={a.type === 'student' ? 'blue' : 'purple'} size="sm">
                        <UserRound />
                      </IconBox>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-heading">
                          {a.type === 'student' ? 'Janji Temu Siswa' : 'Janji Temu Personal'}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {a.scheduled_at
                            ? formatInTimeZone(new Date(a.scheduled_at), 'Asia/Jakarta', 'dd MMM yyyy HH:mm', { locale: idLocale })
                            : 'Belum dijadwalkan'}
                        </p>
                        {a.location && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3" />
                            <span className="capitalize">{a.location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <StatusBadge
                        tone={severityTone(a.status)}
                        label={appointmentStatusLabel(a.status)}
                      />
                      {a.status === 'awaiting_psychologist_availability' && (
                        <Button size="sm" onClick={() => handleConfirmAppointment(a.appointment_id)}>
                          Pilih Slot &amp; Konfirmasi
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-border pt-4">
                    <Label
                      htmlFor={`catatan-${a.appointment_id}`}
                      className="gap-1.5 text-xs"
                    >
                      <NotebookPen className="size-3.5 text-primary" />
                      Catatan Hasil Pertemuan
                    </Label>
                    <Textarea
                      id={`catatan-${a.appointment_id}`}
                      className="text-xs"
                      rows={2}
                      placeholder="Tulis catatan hasil pertemuan…"
                      value={noteForm[a.appointment_id] ?? a.notes ?? ''}
                      onChange={(e) => setNoteForm(prev => ({ ...prev, [a.appointment_id]: e.target.value }))}
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSaveNotes(a.appointment_id)}
                        disabled={savingNote === a.appointment_id}
                      >
                        {savingNote === a.appointment_id ? 'Menyimpan…' : 'Simpan Catatan'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: detail janji temu */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Janji Temu</DialogTitle>
          </DialogHeader>
          {apptLoading ? (
            <div className="flex items-center justify-center gap-2.5 py-6">
              <span className="size-4 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
              <p className="text-sm text-muted-foreground">Memuat detail…</p>
            </div>
          ) : viewingAppointment ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Tipe</p>
                  <p className="text-sm font-semibold text-heading">
                    {viewingAppointment.type === 'student' ? 'Siswa' : 'Personal'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge
                    tone={severityTone(viewingAppointment.status)}
                    label={appointmentStatusLabel(viewingAppointment.status)}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Jadwal</p>
                  <p className="text-sm font-semibold text-heading">
                    {viewingSlot
                      ? formatInTimeZone(new Date(viewingSlot.slot_start), 'Asia/Jakarta', 'dd MMM yyyy HH:mm', { locale: idLocale })
                      : viewingAppointment.scheduled_at
                        ? formatInTimeZone(new Date(viewingAppointment.scheduled_at), 'Asia/Jakarta', 'dd MMM yyyy HH:mm', { locale: idLocale })
                        : 'Belum dijadwalkan'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lokasi</p>
                  <p className="text-sm font-semibold capitalize text-heading">
                    {viewingAppointment.location ?? '-'}
                  </p>
                </div>
              </div>
              {viewingAppointment.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Catatan</p>
                  <p className="mt-1 rounded-xl border border-border bg-muted/40 p-3 text-sm text-secondary-text">
                    {viewingAppointment.notes}
                  </p>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setViewDialogOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: pindahkan slot */}
      <Dialog open={moveDialogOpen} onOpenChange={(open) => { if (!open) { setMoveDialogOpen(false); setMoveTargetSlotId(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pindahkan Janji Temu</DialogTitle>
            <DialogDescription>
              Pilih slot kosong baru untuk memindahkan janji temu ini.
            </DialogDescription>
          </DialogHeader>
          {moveSlot && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
                <IconBox tone="slate" size="sm">
                  <Clock />
                </IconBox>
                <div>
                  <p className="text-xs text-muted-foreground">Slot lama</p>
                  <p className="text-sm font-semibold text-heading">{formatSlotDate(moveSlot.slot_start)}</p>
                  <p className="text-xs text-muted-foreground">{formatSlotTime(moveSlot.slot_start, moveSlot.slot_end)}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="psy-move-target">Pilih slot kosong baru</Label>
                <select
                  id="psy-move-target"
                  className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm text-card-foreground outline-none focus-visible:border-primary"
                  value={moveTargetSlotId}
                  onChange={(e) => setMoveTargetSlotId(e.target.value)}
                >
                  <option value="">— Pilih Slot —</option>
                  {movableSlots.map((s) => (
                    <option key={s.slot_id} value={s.slot_id}>
                      {formatSlotDate(s.slot_start)} · {formatSlotTime(s.slot_start, s.slot_end)}
                    </option>
                  ))}
                </select>
                {movableSlots.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Tidak ada slot kosong tersedia. Tambahkan slot baru terlebih dahulu.
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setMoveDialogOpen(false); setMoveTargetSlotId(''); }} disabled={moveLoading}>
              Batal
            </Button>
            <Button size="sm" onClick={confirmMoveSlot} disabled={moveLoading || !moveTargetSlotId}>
              {moveLoading ? 'Memproses…' : 'Pindahkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: hapus slot */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Slot</DialogTitle>
            <DialogDescription>
              Slot yang dihapus tidak dapat dikembalikan. Slot dengan janji temu aktif tidak bisa dihapus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDeleteSlot} disabled={deleteLoading}>
              {deleteLoading ? 'Menghapus…' : 'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}