"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Clock,
  Activity,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Calendar,
  Plus,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { localDatetimeToUTC, formatLocalTime, formatLocalTimeOnly } from "@/lib/utils";
import { toast } from "sonner";
import CounselingSessions from "@/components/counselor/CounselingSessions";
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

// ─── Dashboard Stats Card ──────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon,
  valueColor,
  subtitle,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  valueColor?: string;
  subtitle: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueColor ?? ""}`}>{value}</div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// ─── Dormant Cases ───────────────────────────────────────────────────────────

function DormantCases({ cases, onRefresh }: { cases: DormantCase[]; onRefresh: () => void }) {
  if (cases.length === 0) {
    return (
      <Card className="col-span-1 border-dashed">
        <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-3">
          <Activity className="h-8 w-8 opacity-50" />
          <p>No dormant cases found. All cases engaged recently.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Needs Engagement</CardTitle>
          <CardDescription>
            Cases with no activity recorded in the last 5 days
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="gap-1.5 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {cases.map((c) => (
            <div
              key={c.case_id}
              className="flex items-center justify-between pb-4 border-b last:border-0 last:pb-0"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none flex items-center gap-2">
                  Case #{c.case_id.split("-")[0]}
                  <Badge
                    variant={
                      c.risk_level === "CRITICAL" || c.risk_level === "HIGH"
                        ? "destructive"
                        : "secondary"
                    }
                    className="text-[10px] px-1 py-0 h-4"
                  >
                    {c.risk_level}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last activity{" "}
                  {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                </p>
              </div>
              <a href={`/dashboard/cases/${c.case_id}`}>
                <Button size="sm" variant="ghost">
                  Review <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </a>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
  const [bookedAppointment, setBookedAppointment] = useState<any | null>(null);
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
      setError(res.error ?? "Failed to load dashboard data.");
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
    const res = await apiClient<any>(`/appointments/${slot.appointment_id}`);
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
    if (res.success) { toast.success('Appointment dipindahkan.'); fetchDashboard(); }
    else { toast.error(res.error ?? 'Gagal memindahkan appointment.'); }
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
    fetchDashboard();
  }, []);

  const stats = data?.stats;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Caseload Overview</h2>
          <p className="text-muted-foreground">
            Monitor high-urgency cases, alerts, and intervention schedules.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDashboard} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted rounded mb-1" />
                <div className="h-3 w-32 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !stats ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
            <AlertCircle className="w-6 h-6 opacity-50" />
            <p>Dashboard metrics unavailable for this role.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Open Cases"
            value={stats.activeCases}
            icon={<Activity className="h-4 w-4 text-muted-foreground" />}
            subtitle="Cases currently active"
          />
          <StatCard
            title="Critical Risk"
            value={stats.criticalCases}
            icon={<ShieldAlert className="h-4 w-4 text-destructive" />}
            valueColor="text-destructive"
            subtitle="Cases requiring immediate attention"
          />
          <StatCard
            title="Overdue Interventions"
            value={stats.overdueInterventions}
            icon={<Clock className="h-4 w-4 text-orange-500" />}
            valueColor="text-orange-500"
            subtitle="Action past scheduled date"
          />
          <StatCard
            title="Pending Alerts"
            value={stats.unreviewedAlerts}
            icon={<AlertCircle className="h-4 w-4 text-yellow-500" />}
            valueColor="text-yellow-500"
            subtitle="Unreviewed pattern detections"
          />
        </div>
      )}

      {/* Dormant Cases */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <Card className="col-span-1 animate-pulse">
            <CardHeader>
              <div className="h-5 w-40 bg-muted rounded" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 bg-muted rounded" />
              ))}
            </CardContent>
          </Card>
        ) : (
          <DormantCases
            cases={data?.dormantCases ?? []}
            onRefresh={fetchDashboard}
          />
        )}
      </div>

      {/* Availability */}
      <Card>
        <CardHeader>
          <CardTitle>Ketersediaan Jadwal Konseling</CardTitle>
          <CardDescription>Tambah slot waktu tersedia agar guru/staff dapat booking melalui QR.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddAvailability} className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Mulai</Label>
              <input
                type="datetime-local"
                className="border rounded p-2"
                value={slotForm.slot_start}
                onChange={(e) => setSlotForm({ ...slotForm, slot_start: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Selesai</Label>
              <input
                type="datetime-local"
                className="border rounded p-2"
                value={slotForm.slot_end}
                onChange={(e) => setSlotForm({ ...slotForm, slot_end: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repeatEnabled}
                  onChange={(e) => setRepeatEnabled(e.target.checked)}
                  className="accent-primary"
                />
                Berulang
              </Label>
              {repeatEnabled && (
                <div className="flex gap-2 items-center">
                  <select
                    className="border rounded p-1.5 text-xs"
                    value={repeatPattern}
                    onChange={(e) => setRepeatPattern(e.target.value as 'weekly' | 'biweekly' | 'monthly')}
                  >
                    <option value="weekly">Mingguan</option>
                    <option value="biweekly">Dua Mingguan</option>
                    <option value="monthly">Bulanan</option>
                  </select>
                  {repeatPattern === 'biweekly' && (
                    <select
                      className="border rounded p-1.5 text-xs"
                      value={repeatWeeks}
                      onChange={(e) => setRepeatWeeks(Number(e.target.value) as 1 | 2 | 3 | 4)}
                    >
                      <option value={1}>Setiap 1 minggu</option>
                      <option value={2}>Setiap 2 minggu</option>
                      <option value={3}>Setiap 3 minggu</option>
                      <option value={4}>Setiap 4 minggu</option>
                    </select>
                  )}
                </div>
              )}
            </div>
            <Button type="submit" className="gap-2">
              <Plus className="w-4 h-4" /> {repeatEnabled ? 'Tambah Berulang' : 'Tambah Slot'}
            </Button>
          </form>

          {/* Calendar view of slots */}
          {availability.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Kalender Slot</Label>
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

          {/* Grid view of slots */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {availability
              .slice()
              .sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime())
              .map((s) => (
                <div key={s.slot_id} className="flex flex-col justify-between border rounded p-2 text-xs">
                  <div>
                    <p className="font-medium">
                      {formatLocalTime(s.slot_start).split(',')[0]}
                    </p>
                    <p className="text-muted-foreground text-[10px]">
                      {formatLocalTime(s.slot_start).split(', ')[1]} – {formatLocalTimeOnly(s.slot_end)}
                    </p>
                  </div>
                  <Badge className={`mt-1 text-[10px] justify-center ${s.appointment_id ? 'bg-red-100 text-red-800' : s.is_available ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {s.appointment_id ? 'Dipesan' : s.is_available ? 'Tersedia' : 'Nonaktif'}
                  </Badge>
                  {s.appointment_id ? (
                    <div className="flex gap-1 mt-1">
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-1 flex-1" onClick={() => handleSlotClick(s)}>Lihat</Button>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-1 flex-1 text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => { setMoveSlot(s); setMoveDialogOpen(true); }}>Pindahkan</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="destructive" className="h-6 text-[10px] mt-1 w-full" onClick={() => { setSlotToDelete(s.slot_id); setDeleteDialogOpen(true); }}>Hapus</Button>
                  )}
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      <CounselingSessions />

      <Dialog open={!!selectedBookedSlot} onOpenChange={(open) => { if (!open) { setSelectedBookedSlot(null); setBookedAppointment(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Jadwal Konseling</DialogTitle>
          </DialogHeader>
          {loadingAppointment ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Memuat...</p>
          ) : bookedAppointment ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Waktu:</span></div>
                <div>{selectedBookedSlot ? `${formatLocalTime(selectedBookedSlot.slot_start)} – ${formatLocalTimeOnly(selectedBookedSlot.slot_end)}` : '-'}</div>
                <div><span className="text-muted-foreground">Status:</span></div>
                <div><span className={`inline-block px-2 py-0.5 rounded text-xs ${bookedAppointment.status === 'confirmed' ? 'bg-green-100 text-green-800' : bookedAppointment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>{bookedAppointment.status}</span></div>
                <div><span className="text-muted-foreground">Lokasi:</span></div>
                <div>{bookedAppointment.location ?? '-'}</div>
                {bookedAppointment.notes && (
                  <>
                    <div><span className="text-muted-foreground">Catatan:</span></div>
                    <div>{bookedAppointment.notes}</div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Detail tidak tersedia.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Move Slot */}
      <Dialog open={moveDialogOpen} onOpenChange={(open) => { if (!open) { setMoveDialogOpen(false); setMoveTargetSlotId(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pindahkan Appointment</DialogTitle>
            <DialogDescription className="text-xs">
              Pilih slot kosong baru untuk memindahkan appointment ini.
            </DialogDescription>
          </DialogHeader>
          {moveSlot && (
            <div className="space-y-3">
              <div className="border rounded p-3 text-sm">
                <p className="font-medium text-xs text-muted-foreground mb-1">Slot lama:</p>
                <p className="font-medium">{formatLocalTime(moveSlot.slot_start).split(', ')[0]}</p>
                <p className="text-muted-foreground text-xs">
                  {formatLocalTime(moveSlot.slot_start).split(', ')[1]} – {formatLocalTimeOnly(moveSlot.slot_end)}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pilih slot kosong baru:</Label>
                <select
                  className="border rounded w-full p-2 text-sm"
                  value={moveTargetSlotId}
                  onChange={(e) => setMoveTargetSlotId(e.target.value)}
                >
                  <option value="">-- Pilih Slot --</option>
                  {availability
                    .filter(s => s.is_available && !s.appointment_id && s.slot_id !== moveSlot?.slot_id)
                    .sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime())
                    .map(s => (
                      <option key={s.slot_id} value={s.slot_id}>
                        {formatLocalTime(s.slot_start).split(', ')[0]} {formatLocalTime(s.slot_start).split(', ')[1]} – {formatLocalTimeOnly(s.slot_end)}
                      </option>
                    ))}
                </select>
                {availability.filter(s => s.is_available && !s.appointment_id && s.slot_id !== moveSlot?.slot_id).length === 0 && (
                  <p className="text-xs text-muted-foreground">Tidak ada slot kosong tersedia.</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setMoveDialogOpen(false); setMoveTargetSlotId(''); }} disabled={moveLoading}>Batal</Button>
            <Button size="sm" onClick={confirmMoveSlot} disabled={moveLoading || !moveTargetSlotId}>
              {moveLoading ? 'Memproses...' : 'Pindahkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delete Slot */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Slot</DialogTitle>
            <DialogDescription className="text-xs">
              Slot yang dihapus tidak dapat dikembalikan. Slot dengan appointment aktif tidak bisa dihapus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>Batal</Button>
            <Button size="sm" variant="destructive" onClick={confirmDeleteSlot} disabled={deleteLoading}>
              {deleteLoading ? 'Menghapus...' : 'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
