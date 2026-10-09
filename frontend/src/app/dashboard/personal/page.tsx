'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { id as localeId } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  CalendarClock,
  CalendarPlus,
  Loader2,
  MapPin,
  NotebookPen,
  Video,
} from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import {
  StatusBadge,
  severityTone,
  type StatusTone,
} from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AppointmentPicker,
  type AvailabilitySlot,
} from '@/components/ui/appointment-picker';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  slot_id: string | null;
};

const emptyForm: FormState = {
  counselor_id: '',
  location: 'online',
  notes: '',
  slot_id: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIMEZONE = 'Asia/Jakarta';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu',
  confirmed: 'Terkonfirmasi',
  cancelled: 'Dibatalkan',
  completed: 'Selesai',
};

const statusLabel = (status?: string | null) => {
  const key = (status ?? '').toLowerCase();
  return STATUS_LABELS[key] ?? status ?? 'Tidak diketahui';
};

/** `CONFIRMED` belum dipetakan di severityTone, jadi dilayani di halaman ini. */
const appointmentTone = (status?: string | null): StatusTone => {
  const key = (status ?? '').toUpperCase();
  if (key === 'CONFIRMED') return 'success';
  if (key === 'CANCELLED' || key === 'CANCELED') return 'danger';
  return severityTone(status);
};

const locationLabel = (location?: string | null) =>
  location === 'online' ? 'Online' : location === 'offline' ? 'Tatap muka' : '—';

const formatSchedule = (value?: string | null) =>
  value
    ? formatInTimeZone(new Date(value), TIMEZONE, "dd MMM yyyy · HH:mm", {
        locale: localeId,
      })
    : 'Belum dijadwalkan';

const GENDER_LABELS: Record<string, string> = {
  male: 'Laki-laki',
  female: 'Perempuan',
};

const genderLabel = (gender?: string | null) => {
  const key = (gender ?? '').toLowerCase();
  return GENDER_LABELS[key] ?? gender ?? '-';
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PersonalDashboardPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [counselors, setCounselors] = useState<CounselorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Waktu pemuatan terakhir — dipakai sebagai acuan "janji temu akan datang". */
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const isMale = (user?.gender ?? '').toLowerCase() === 'male';

  const fetchData = async () => {
    setLoading(true);
    const [apptRes, counselorRes] = await Promise.all([
      apiClient<Appointment[]>(
        `/appointments?type=personal&created_for=${user?.user_id}`,
      ),
      apiClient<CounselorOption[]>('/appointments/counselors'),
    ]);
    if (apptRes.success && apptRes.data) setAppointments(apptRes.data);
    if (counselorRes.success && counselorRes.data) setCounselors(counselorRes.data);
    setLoadedAt(Date.now());
    setLoading(false);
  };

  const fetchSlots = async (counselorId: string) => {
    setLoadingSlots(true);
    setSlots([]);
    setSelectedDate(undefined);
    setForm((f) => ({ ...f, slot_id: null }));
    const res = await apiClient<AvailabilitySlot[]>(`/availability/${counselorId}`);
    if (res.success && res.data) {
      setSlots(res.data.filter((s) => s.is_available));
    }
    setLoadingSlots(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  const handleCreate = async () => {
    if (!form.counselor_id) {
      toast.error('Pilih konselor terlebih dahulu');
      return;
    }
    if (!form.slot_id) {
      toast.error('Pilih tanggal dan waktu terlebih dahulu');
      return;
    }
    setCreating(true);
    // 1. Buat janji temu berstatus menunggu
    const createRes = await apiClient('/appointments/personal', {
      method: 'POST',
      body: {
        counselor_id: form.counselor_id,
        location: form.location,
        notes: form.notes,
      },
    });
    if (!createRes.success || !createRes.data) {
      toast.error(createRes.error ?? 'Gagal membuat janji temu');
      setCreating(false);
      return;
    }
    // Bentuk respons: { appointment: { appointment_id: string }, matched_counselor_id: string }
    const created = createRes.data as unknown as {
      appointment: { appointment_id: string };
    };
    const appointmentId = created?.appointment?.appointment_id;
    if (!appointmentId) {
      toast.error('Struktur respons tidak sesuai');
      setCreating(false);
      return;
    }
    // 2. Konfirmasi dengan jadwal dari slot yang dipilih
    const slot = slots.find((s) => s.slot_id === form.slot_id);
    if (!slot) {
      toast.error('Slot waktu tidak ditemukan');
      setCreating(false);
      return;
    }
    const confirmRes = await apiClient(`/appointments/${appointmentId}/confirm`, {
      method: 'POST',
      body: { scheduled_at: slot.slot_start },
    });
    setCreating(false);
    if (confirmRes.success) {
      toast.success('Janji temu berhasil dikonfirmasi');
      setDialogOpen(false);
      setForm(emptyForm);
      setSlots([]);
      setSelectedDate(undefined);
      fetchData();
    } else {
      toast.error(confirmRes.error ?? 'Gagal mengonfirmasi janji temu');
    }
  };

  const eligibleCounselors = counselors.filter(
    (c) => !isMale || c.gender.toLowerCase() === 'male',
  );

  const handleCounselorChange = (id: string | null) => {
    const value = id ?? '';
    setForm((f) => ({ ...f, counselor_id: value, slot_id: null }));
    setSelectedDate(undefined);
    if (value) fetchSlots(value);
  };

  const selectedSlot = slots.find((s) => s.slot_id === form.slot_id);

  const stats = useMemo(() => {
    const pending = appointments.filter((a) => a.status === 'pending').length;
    const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
    const upcoming = appointments.filter(
      (a) =>
        a.scheduled_at &&
        a.status !== 'cancelled' &&
        new Date(a.scheduled_at).getTime() >= (loadedAt ?? 0),
    ).length;
    const total = appointments.length;
    return {
      total,
      pending,
      confirmed,
      upcoming,
      confirmedPct: total > 0 ? Math.round((confirmed / total) * 100) : 0,
    };
  }, [appointments, loadedAt]);

  const firstName = user?.full_name?.split(' ')[0] ?? '';

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Halo, ${firstName}` : 'Dashboard Konseling Personal'}
        description="Buat janji temu konseling dengan konselor internal dan pantau hasilnya di sini."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button>
                  <CalendarPlus className="size-4" />
                  Buat Janji Temu
                </Button>
              }
            />
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Buat Janji Temu Konseling</DialogTitle>
                <DialogDescription>
                  Pilih konselor, tentukan jadwal, lalu konfirmasi janji temu Anda.
                  {isMale
                    ? ' Sesuai aturan, Anda hanya dapat memilih konselor laki-laki.'
                    : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Langkah 1: Konselor */}
                <div className="space-y-2">
                  <Label htmlFor="konselor">Konselor</Label>
                  <Select
                    value={form.counselor_id}
                    onValueChange={handleCounselorChange}
                  >
                    <SelectTrigger id="konselor" className="w-full">
                      <SelectValue placeholder="Pilih konselor" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleCounselors.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>
                          {c.full_name} ({genderLabel(c.gender)})
                        </SelectItem>
                      ))}
                      {eligibleCounselors.length === 0 && (
                        <SelectItem value="" disabled>
                          Tidak ada konselor tersedia
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {isMale && counselors.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Hanya menampilkan konselor laki-laki sesuai aturan yang
                      berlaku.
                    </p>
                  )}
                </div>

                {/* Langkah 2: Tanggal & waktu */}
                {form.counselor_id && (
                  <div className="space-y-2">
                    <Label>
                      Tanggal &amp; Waktu
                      {loadingSlots && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          Memuat jadwal…
                        </span>
                      )}
                    </Label>
                    {!loadingSlots && slots.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Konselor belum memiliki jadwal ketersediaan. Silakan
                        pilih konselor lain.
                      </p>
                    )}
                    {slots.length > 0 && (
                      <AppointmentPicker
                        slots={slots}
                        selectedDate={selectedDate}
                        onDateSelect={setSelectedDate}
                        selectedSlotId={form.slot_id}
                        onSlotSelect={(slotId) =>
                          setForm((f) => ({ ...f, slot_id: slotId }))
                        }
                      />
                    )}
                    {selectedSlot && (
                      <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
                        <CalendarClock className="size-4" />
                        {formatInTimeZone(
                          new Date(selectedSlot.slot_start),
                          TIMEZONE,
                          "dd MMM yyyy · HH:mm",
                          { locale: localeId },
                        )}
                      </p>
                    )}
                  </div>
                )}

                {/* Langkah 3: Lokasi */}
                <div className="space-y-2">
                  <Label htmlFor="lokasi">Lokasi</Label>
                  <Select
                    value={form.location}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        location: value as 'online' | 'offline',
                      })
                    }
                  >
                    <SelectTrigger id="lokasi" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="offline">Tatap muka</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Langkah 4: Catatan */}
                <div className="space-y-2">
                  <Label htmlFor="catatan">Catatan</Label>
                  <Textarea
                    id="catatan"
                    value={form.notes}
                    onChange={(event) =>
                      setForm({ ...form, notes: event.target.value })
                    }
                    placeholder="Opsional — ceritakan tujuan konseling Anda"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={creating}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating || !form.counselor_id || !form.slot_id}
                >
                  {creating ? 'Menyimpan…' : 'Konfirmasi Janji Temu'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Baris kartu statistik */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Janji Temu Saya"
          value={loading ? '—' : stats.total}
          hint="Seluruh janji temu konseling yang pernah Anda buat."
          icon={<CalendarClock />}
          iconTone="blue"
        />
        <StatCard
          label="Akan Datang"
          value={loading ? '—' : stats.upcoming}
          hint="Janji temu yang sudah dijadwalkan dan belum lewat."
          icon={<Video />}
          iconTone="teal"
        />
        <StatCard
          label="Menunggu Konfirmasi"
          value={loading ? '—' : stats.pending}
          hint="Janji temu yang masih menunggu persetujuan konselor."
          icon={<NotebookPen />}
          iconTone="yellow"
          trend={stats.pending > 0 ? 'up' : 'down'}
          trendLabel={stats.pending > 0 ? 'perlu ditunggu' : 'selesai'}
        />
        <StatCard
          label="Terkonfirmasi"
          value={loading ? '—' : stats.confirmed}
          hint="Janji temu yang jadwalnya sudah disepakati."
          icon={<MapPin />}
          iconTone="green"
          progress={stats.confirmedPct}
          progressLabel="Porsi janji temu terkonfirmasi"
        />
      </div>

      {/* Daftar janji temu */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Janji Temu Saya</CardTitle>
          <CardDescription>
            Jadwal konseling personal beserta status perkembangannya.
          </CardDescription>
          <CardAction>
            <Badge variant="muted">{stats.total} janji temu</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="size-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
              <p className="text-sm text-muted-foreground">
                Memuat janji temu Anda…
              </p>
            </div>
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={<CalendarClock />}
              title="Belum ada janji temu"
              description="Anda belum memiliki janji temu konseling. Mulai dengan membuat janji temu pertama Anda."
              action={
                <Button onClick={() => setDialogOpen(true)}>
                  <CalendarPlus className="size-4" />
                  Buat Janji Temu
                </Button>
              }
            />
          ) : (
            <DataTable>
              <TableHead>
                <TableRow>
                  <TableHeaderCell scope="col">Layanan</TableHeaderCell>
                  <TableHeaderCell scope="col">Jadwal</TableHeaderCell>
                  <TableHeaderCell scope="col">Lokasi</TableHeaderCell>
                  <TableHeaderCell scope="col">Catatan</TableHeaderCell>
                  <TableHeaderCell scope="col">Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {appointments.map((appointment) => (
                  <TableRow key={appointment.appointment_id}>
                    <TableCell>
                      <p className="font-medium text-heading">
                        Konseling Personal
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ID: {appointment.appointment_id.slice(0, 8)}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-secondary-text">
                      {formatSchedule(appointment.scheduled_at)}
                    </TableCell>
                    <TableCell className="text-secondary-text">
                      {locationLabel(appointment.location)}
                    </TableCell>
                    <TableCell className="max-w-[16rem] text-secondary-text">
                      <span className="line-clamp-2">
                        {appointment.notes ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={appointmentTone(appointment.status)}
                        label={statusLabel(appointment.status)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}