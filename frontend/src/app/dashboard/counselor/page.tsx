"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Clock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { localDatetimeToUTC, formatLocalTime, formatLocalTimeOnly } from "@/lib/utils";
import { toast } from "sonner";
import { AppointmentPicker } from "@/components/ui/appointment-picker";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardStats {
  activeCases: number;
  criticalCases: number;
  overdueInterventions: number;
  unreviewedAlerts: number;
}

interface DormantCase {
  case_id: string;
  risk_level: string;
  updated_at: string;
  student_name?: string | null;
}

interface DashboardData {
  stats: DashboardStats;
  dormantCases: DormantCase[];
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

interface BookedAppointment {
  status?: string | null;
  location?: string | null;
  notes?: string | null;
  updated_at?: string | null;
}

/** Format a case as "Kasus <Nama Siswa> #3e7bfccd". */
function caseTitle(c: { case_id: string; student_name?: string | null }): string {
  const short = c.case_id.slice(0, 8);
  return c.student_name ? `Kasus ${c.student_name} #${short}` : `Kasus #${short}`;
}

const repeatLabels: Record<string, string> = {
  weekly: "Mingguan",
  biweekly: "Dua mingguan",
  monthly: "Bulanan",
};

const appointmentStatusLabel = (status?: string | null): string => {
  switch ((status || "").toLowerCase()) {
    case "confirmed":
      return "Dikonfirmasi";
    case "pending":
      return "Menunggu";
    case "cancelled":
      return "Dibatalkan";
    case "completed":
      return "Selesai";
    default:
      return status || "Tidak diketahui";
  }
};

// ─── Kasus perlu keterlibatan ────────────────────────────────────────────────

function DormantCases({ cases, onRefresh }: { cases: DormantCase[]; onRefresh: () => void }) {
  if (cases.length === 0) {
    return (
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Kasus Perlu Keterlibatan</CardTitle>
          <CardDescription>Kasus tanpa aktivitas dalam 5 hari terakhir.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Activity className="size-6" />}
            title="Semua kasus aktif"
            description="Tidak ada kasus yang menganggur. Semua kasus sudah memiliki aktivitas terbaru."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle>Kasus Perlu Keterlibatan</CardTitle>
        <CardDescription>Kasus tanpa aktivitas dalam 5 hari terakhir.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable scroll={false}>
          <TableHead>
            <TableRow>
              <TableHeaderCell scope="col">Kasus</TableHeaderCell>
              <TableHeaderCell scope="col">Risiko</TableHeaderCell>
              <TableHeaderCell scope="col">Aktivitas Terakhir</TableHeaderCell>
              <TableHeaderCell scope="col" className="text-right">Aksi</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {cases.map((c) => (
              <TableRow key={c.case_id}>
                <TableCell>
                  <span className="text-sm font-semibold text-heading">{caseTitle(c)}</span>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={severityTone(c.risk_level)} label={c.risk_level} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: idLocale })}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="xs" variant="ghost" render={
                    <a href={`/dashboard/cases/${c.case_id}`} />
                  }>
                    Tinjau
                    <ArrowRight className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5">
          <RefreshCw className="size-3.5" />
          Muat ulang
        </Button>
        <p className="text-xs text-muted-foreground">{cases.length} kasus perlu ditinjau.</p>
      </CardFooter>
    </Card>
  );
}

// ─── Halaman Utama ───────────────────────────────────────────────────────────

export default function CounselorDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [slotForm, setSlotForm] = useState({ slot_start: "", slot_end: "" });
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatPattern, setRepeatPattern] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [repeatWeeks, setRepeatWeeks] = useState<1 | 2 | 3 | 4>(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedBookedSlot, setSelectedBookedSlot] = useState<{ slot_id: string; slot_start: string; slot_end: string; appointment_id: string } | null>(null);
  const [bookedAppointment, setBookedAppointment] = useState<BookedAppointment | null>(null);
  const [loadingAppointment, setLoadingAppointment] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveSlot, setMoveSlot] = useState<AvailabilitySlot | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveTargetSlotId, setMoveTargetSlotId] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    const res = await apiClient<DashboardData>("/counselor/dashboard");
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error ?? "Gagal memuat data dasbor.");
    }
    const user = (typeof window !== 'undefined') ? JSON.parse(localStorage.getItem('swims_user') || '{}') : {};
    if (user.user_id) {
      const availRes = await apiClient<AvailabilitySlot[]>(`/availability/${user.user_id}`);
      if (availRes.success && availRes.data) setAvailability(availRes.data);
    }
    setLoading(false);
  };

  const handleSlotClick = async (slot: AvailabilitySlot) => {
    if (!slot.appointment_id) return;
    setSelectedBookedSlot({ slot_id: slot.slot_id, slot_start: slot.slot_start, slot_end: slot.slot_end, appointment_id: slot.appointment_id });
    setLoadingAppointment(true);
    const res = await apiClient<BookedAppointment>(`/appointments/${slot.appointment_id}`);
    if (res.success && res.data) {
      setBookedAppointment(res.data);
    } else {
      toast.error('Gagal memuat detail jadwal.');
      setBookedAppointment(null);
    }
    setLoadingAppointment(false);
  };

  const handleAddAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('swims_user') || '{}');
    if (!user.user_id) { toast.error('Sesi tidak valid.'); return; }
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
      toast.success(repeatEnabled ? 'Slot berulang ditambahkan' : 'Slot ketersediaan ditambahkan');
      setSlotForm({ slot_start: '', slot_end: '' });
      setRepeatEnabled(false);
      fetchDashboard();
    } else {
      toast.error(res.error ?? 'Gagal menambah slot');
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
    if (res.success) { toast.success('Janji temu dipindahkan.'); fetchDashboard(); }
    else { toast.error(res.error ?? 'Gagal memindahkan janji temu.'); }
  };

  const confirmDeleteSlot = async () => {
    if (!slotToDelete) return;
    setDeleteLoading(true);
    const res = await apiClient(`/availability/${slotToDelete}`, { method: 'DELETE' });
    setDeleteLoading(false);
    setDeleteDialogOpen(false);
    setSlotToDelete(null);
    if (res.success) { toast.success('Slot dihapus'); fetchDashboard(); }
    else { toast.error('Gagal menghapus slot'); }
  };

  useEffect(() => {
    const load = async () => {
      await fetchDashboard();
    };
    void load();
  }, []);

  const stats = data?.stats;
  const sortedSlots = availability
    .slice()
    .sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime());
  const freeSlots = sortedSlots.filter((s) => s.is_available && !s.appointment_id);
  const movableSlots = freeSlots.filter((s) => s.slot_id !== moveSlot?.slot_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ringkasan Beban Kasus"
        description="Pantau kasus berisiko tinggi, peringatan, dan jadwal intervensi Anda."
        actions={
          <Button variant="outline" size="sm" onClick={fetchDashboard} disabled={loading} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Muat ulang
          </Button>
        }
      />

      {error && (
        <Card className="border-danger/30 bg-danger-soft">
          <CardContent className="flex items-center gap-3 py-4">
            <IconBox tone="red" size="sm">
              <AlertCircle />
            </IconBox>
            <p className="text-sm text-danger">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Statistik */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 w-24 rounded bg-muted" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-8 w-16 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !stats ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<AlertCircle className="size-6" />}
              title="Metrik dasbor tidak tersedia"
              description="Statistik belum dapat dimuat untuk peran ini. Silakan muat ulang beberapa saat lagi."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Kasus Aktif"
            value={stats.activeCases}
            hint="Kasus yang sedang ditangani"
            icon={<Activity className="size-5" />}
            iconTone="blue"
          />
          <StatCard
            label="Risiko Kritis"
            value={stats.criticalCases}
            hint="Perlu tindakan segera"
            icon={<ShieldAlert className="size-5" />}
            iconTone="red"
            trend={stats.criticalCases > 0 ? "up" : "flat"}
            trendLabel={stats.criticalCases > 0 ? "Prioritas tinggi" : "Aman"}
          />
          <StatCard
            label="Intervensi Terlambat"
            value={stats.overdueInterventions}
            hint="Tindakan melewati jadwal"
            icon={<Clock className="size-5" />}
            iconTone="yellow"
            trend={stats.overdueInterventions > 0 ? "up" : "flat"}
            trendLabel={stats.overdueInterventions > 0 ? "Perlu dikejar" : "Tepat waktu"}
          />
          <StatCard
            label="Peringatan Menunggu"
            value={stats.unreviewedAlerts}
            hint="Deteksi pola belum ditinjau"
            icon={<AlertCircle className="size-5" />}
            iconTone="purple"
          />
        </div>
      )}

      {/* Kasus perlu keterlibatan */}
      {loading ? (
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-5 w-48 rounded bg-muted" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      ) : (
        <DormantCases cases={data?.dormantCases ?? []} onRefresh={fetchDashboard} />
      )}

      {/* Ketersediaan jadwal konseling */}
      <Card>
        <CardHeader>
          <CardTitle>Ketersediaan Jadwal Konseling</CardTitle>
          <CardDescription>
            Tambahkan slot waktu tersedia agar guru atau staf dapat memesan melalui QR.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleAddAvailability} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="slot-start">Mulai</Label>
                <Input
                  id="slot-start"
                  type="datetime-local"
                  value={slotForm.slot_start}
                  onChange={(e) => setSlotForm({ ...slotForm, slot_start: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slot-end">Selesai</Label>
                <Input
                  id="slot-end"
                  type="datetime-local"
                  value={slotForm.slot_end}
                  onChange={(e) => setSlotForm({ ...slotForm, slot_end: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slot-repeat">Pola Berulang</Label>
                <div className="flex h-10 items-center gap-2.5 rounded-[10px] border border-input bg-card px-3.5">
                  <Switch
                    id="slot-repeat"
                    checked={repeatEnabled}
                    onCheckedChange={(checked) => setRepeatEnabled(checked as boolean)}
                  />
                  <span className="text-sm text-secondary-text">
                    {repeatEnabled ? repeatLabels[repeatPattern] : "Tidak berulang"}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slot-weeks">Interval Minggu</Label>
                <select
                  id="slot-weeks"
                  className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm text-card-foreground outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                  value={repeatWeeks}
                  disabled={!repeatEnabled || repeatPattern !== 'biweekly'}
                  onChange={(e) => setRepeatWeeks(Number(e.target.value) as 1 | 2 | 3 | 4)}
                >
                  <option value={1}>Setiap 1 minggu</option>
                  <option value={2}>Setiap 2 minggu</option>
                  <option value={3}>Setiap 3 minggu</option>
                  <option value={4}>Setiap 4 minggu</option>
                </select>
              </div>
            </div>

            {repeatEnabled && (
              <div className="grid gap-2 sm:grid-cols-3">
                {(['weekly', 'biweekly', 'monthly'] as const).map((pattern) => (
                  <button
                    key={pattern}
                    type="button"
                    onClick={() => setRepeatPattern(pattern)}
                    aria-pressed={repeatPattern === pattern}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                      repeatPattern === pattern
                        ? 'border-primary/30 bg-primary-softer text-primary'
                        : 'border-border bg-card text-secondary-text hover:bg-primary-softer'
                    }`}
                  >
                    {repeatLabels[pattern]}
                  </button>
                ))}
              </div>
            )}

            <Button type="submit" className="gap-2">
              <Plus className="size-4" />
              {repeatEnabled ? "Tambah Slot Berulang" : "Tambah Slot"}
            </Button>
          </form>

          {availability.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                Kalender Slot
              </Label>
              <AppointmentPicker
                slots={availability}
                selectedDate={selectedDate}
                onDateSelect={(d) => { setSelectedDate(d); }}
                selectedSlotId={null}
                onSlotSelect={() => {}}
                disabledBefore={new Date()}
              />
            </div>
          )}

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" />
              Daftar Slot ({sortedSlots.length})
            </Label>
            {sortedSlots.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border">
                <EmptyState
                  icon={<CalendarDays className="size-6" />}
                  title="Belum ada slot ketersediaan"
                  description="Tambahkan slot waktu di atas agar siswa dan staf dapat melakukan pemesanan konseling."
                />
              </div>
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
                  {sortedSlots.map((s) => (
                    <TableRow key={s.slot_id}>
                      <TableCell className="text-sm font-semibold text-heading">
                        {formatLocalTime(s.slot_start).split(',')[0]}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatLocalTime(s.slot_start).split(', ')[1]} – {formatLocalTimeOnly(s.slot_end)}
                      </TableCell>
                      <TableCell>
                        {s.appointment_id ? (
                          <StatusBadge tone="warning" label="Dipesan" />
                        ) : s.is_available ? (
                          <StatusBadge tone="success" label="Tersedia" />
                        ) : (
                          <StatusBadge tone="neutral" label="Nonaktif" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.repeat_pattern ? repeatLabels[s.repeat_pattern] ?? s.repeat_pattern : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.appointment_id ? (
                          <div className="inline-flex gap-2">
                            <Button size="xs" variant="outline" onClick={() => handleSlotClick(s)}>
                              Lihat
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => { setMoveSlot(s); setMoveTargetSlotId(''); setMoveDialogOpen(true); }}
                            >
                              Pindahkan
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-danger hover:bg-danger-soft"
                            onClick={() => { setSlotToDelete(s.slot_id); setDeleteDialogOpen(true); }}
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
          </div>
        </CardContent>
      </Card>

      {/* Dialog: detail jadwal */}
      <Dialog open={!!selectedBookedSlot} onOpenChange={(open) => { if (!open) { setSelectedBookedSlot(null); setBookedAppointment(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Jadwal Konseling</DialogTitle>
          </DialogHeader>
          {loadingAppointment ? (
            <div className="flex items-center justify-center gap-2.5 py-6">
              <span className="size-4 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
              <p className="text-sm text-muted-foreground">Memuat detail…</p>
            </div>
          ) : bookedAppointment ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Waktu</p>
                  <p className="text-sm font-medium text-heading">
                    {selectedBookedSlot
                      ? `${formatLocalTime(selectedBookedSlot.slot_start)} – ${formatLocalTimeOnly(selectedBookedSlot.slot_end)}`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge
                    tone={severityTone(bookedAppointment.status)}
                    label={appointmentStatusLabel(bookedAppointment.status)}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lokasi</p>
                  <p className="text-sm font-medium text-heading">{bookedAppointment.location ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Terakhir diubah</p>
                  <p className="text-sm font-medium text-heading">
                    {bookedAppointment.updated_at
                      ? formatInTimeZone(new Date(bookedAppointment.updated_at), 'Asia/Jakarta', 'dd MMM yyyy HH:mm', { locale: idLocale })
                      : '-'}
                  </p>
                </div>
              </div>
              {bookedAppointment.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Catatan</p>
                  <p className="mt-1 rounded-xl border border-border bg-muted/40 p-3 text-sm text-secondary-text">
                    {bookedAppointment.notes}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<AlertCircle className="size-6" />}
              title="Detail tidak tersedia"
              description="Informasi jadwal ini belum dapat dimuat. Silakan coba lagi nanti."
            />
          )}
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
                  <p className="text-sm font-semibold text-heading">
                    {formatLocalTime(moveSlot.slot_start).split(', ')[0]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatLocalTime(moveSlot.slot_start).split(', ')[1]} – {formatLocalTimeOnly(moveSlot.slot_end)}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="move-target">Pilih slot kosong baru</Label>
                <select
                  id="move-target"
                  className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm text-card-foreground outline-none focus-visible:border-primary"
                  value={moveTargetSlotId}
                  onChange={(e) => setMoveTargetSlotId(e.target.value)}
                >
                  <option value="">— Pilih Slot —</option>
                  {movableSlots.map((s) => (
                    <option key={s.slot_id} value={s.slot_id}>
                      {formatLocalTime(s.slot_start).split(', ')[0]} {formatLocalTime(s.slot_start).split(', ')[1]} – {formatLocalTimeOnly(s.slot_end)}
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