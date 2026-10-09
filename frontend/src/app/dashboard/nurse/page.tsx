'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { id as localeId } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  CalendarCheck,
  CalendarClock,
  HeartHandshake,
  Loader2,
  Video,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
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
import { StatusBadge, severityTone, type StatusTone } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';

// ─── Types ────────────────────────────────────────────────────────────────────

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

const emptyMediate: MediateForm = {
  status: 'pending',
  scheduled_at: '',
  location: 'online',
  notes: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIMEZONE = 'Asia/Jakarta';

/** Label Bahasa Indonesia untuk status janji temu. */
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

/**
 * `severityTone` menangani sebagian besar status kasus; dua status janji temu
 * berikut belum ada di peta tersebut sehingga dilayani di halaman ini.
 */
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

// ─── Component ────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const pending = appointments.filter((a) => a.status === 'pending').length;
    const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
    const cancelled = appointments.filter((a) => a.status === 'cancelled').length;
    const scheduled = appointments.filter((a) => Boolean(a.scheduled_at)).length;
    const total = appointments.length;
    return {
      total,
      pending,
      confirmed,
      cancelled,
      scheduledPct: total > 0 ? Math.round((scheduled / total) * 100) : 0,
    };
  }, [appointments]);

  const openMediate = (appointment: Appointment) => {
    setSelected(appointment);
    setMediate({
      status: (appointment.status as MediateForm['status']) || 'pending',
      scheduled_at: appointment.scheduled_at
        ? appointment.scheduled_at.slice(0, 16)
        : '',
      location: appointment.location ?? 'online',
      notes: appointment.notes ?? '',
    });
  };

  const handleMediate = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await apiClient(
      `/appointments/${selected.appointment_id}/mediate`,
      {
        method: 'PATCH',
        body: {
          status: mediate.status,
          location: mediate.location,
          notes: mediate.notes,
          scheduled_at: mediate.scheduled_at
            ? (() => {
                const [date, time] = mediate.scheduled_at.split('T');
                const [year, month, day] = date.split('-').map(Number);
                const [hour, minute] = time.split(':').map(Number);
                return new Date(
                  Date.UTC(year, month - 1, day, hour, minute),
                ).toISOString();
              })()
            : null,
        },
      },
    );
    setSaving(false);
    if (res.success) {
      toast.success('Jadwal berhasil diperbarui');
      setSelected(null);
      fetchData();
    } else {
      toast.error(res.error ?? 'Gagal memperbarui jadwal');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Perawat Sekolah"
        description="Mediasi jadwal konseling antara psikolog, orang tua, dan siswa."
        actions={
          <Button
            variant="outline"
            onClick={() => fetchData()}
            disabled={loading}
            aria-label="Muat ulang daftar janji temu"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CalendarCheck className="size-4" />
            )}
            Muat Ulang
          </Button>
        }
      />

      {/* Baris kartu statistik */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Janji Temu Konseling"
          value={loading ? '—' : stats.total}
          hint="Total janji temu siswa yang perlu dimonitor."
          icon={<CalendarClock />}
          iconTone="blue"
        />
        <StatCard
          label="Menunggu Mediasi"
          value={loading ? '—' : stats.pending}
          hint="Janji temu yang jadwalnya belum disepakati."
          icon={<HeartHandshake />}
          iconTone="yellow"
          trend={stats.pending > 0 ? 'up' : 'down'}
          trendLabel={stats.pending > 0 ? 'perlu ditindaklanjuti' : 'aman'}
        />
        <StatCard
          label="Terkonfirmasi"
          value={loading ? '—' : stats.confirmed}
          hint="Janji temu dengan jadwal yang sudah disepakati."
          icon={<CalendarCheck />}
          iconTone="green"
        />
        <StatCard
          label="Jadwal Terisi"
          value={loading ? '—' : `${stats.scheduledPct}%`}
          hint={`${stats.cancelled} janji temu dibatalkan.`}
          icon={<Video />}
          iconTone="purple"
          progress={stats.scheduledPct}
          progressLabel="Porsi janji temu yang sudah dijadwalkan"
        />
      </div>

      {/* Daftar janji temu */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Daftar Janji Temu Konseling</CardTitle>
          <CardDescription>
            Semua janji temu siswa yang perlu dimonitor dan dimediasi.
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
                Memuat daftar janji temu…
              </p>
            </div>
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={<CalendarClock />}
              title="Belum ada data"
              description="Belum ada janji temu konseling siswa. Janji temu baru akan tampil di sini secara otomatis."
            />
          ) : (
            <DataTable>
              <TableHead>
                <TableRow>
                  <TableHeaderCell scope="col">Siswa</TableHeaderCell>
                  <TableHeaderCell scope="col">Jadwal</TableHeaderCell>
                  <TableHeaderCell scope="col">Lokasi</TableHeaderCell>
                  <TableHeaderCell scope="col">Pendamping</TableHeaderCell>
                  <TableHeaderCell scope="col">Status</TableHeaderCell>
                  <TableHeaderCell scope="col">
                    <span className="sr-only">Tindakan</span>
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {appointments.map((appointment) => (
                  <TableRow key={appointment.appointment_id}>
                    <TableCell>
                      <p className="font-medium text-heading">
                        {appointment.student_id
                          ? `Siswa ${appointment.student_id.slice(0, 8)}`
                          : 'Siswa tidak diketahui'}
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
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {appointment.psychologist_id ? (
                          <Badge variant="outline">Psikolog</Badge>
                        ) : null}
                        {appointment.counselor_id ? (
                          <Badge variant="outline">Konselor</Badge>
                        ) : null}
                        {!appointment.psychologist_id &&
                        !appointment.counselor_id ? (
                          <span className="text-xs text-muted-foreground">
                            Belum ditentukan
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={appointmentTone(appointment.status)}
                        label={statusLabel(appointment.status)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog
                        open={selected?.appointment_id === appointment.appointment_id}
                        onOpenChange={(open) => {
                          if (!open) setSelected(null);
                        }}
                      >
                        <DialogTrigger
                          render={
                            <Button variant="outline" size="sm" />
                          }
                          onClick={() => openMediate(appointment)}
                        >
                          Mediasi
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Mediasi Jadwal</DialogTitle>
                            <DialogDescription>
                              Sepakati ulang jadwal konseling bersama siswa,
                              psikolog, dan orang tua.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor={`status-${appointment.appointment_id}`}>
                                Status
                              </Label>
                              <Select
                                value={mediate.status}
                                onValueChange={(value) =>
                                  setMediate({
                                    ...mediate,
                                    status: value as MediateForm['status'],
                                  })
                                }
                              >
                                <SelectTrigger
                                  id={`status-${appointment.appointment_id}`}
                                  className="w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">
                                    Menunggu
                                  </SelectItem>
                                  <SelectItem value="confirmed">
                                    Terkonfirmasi
                                  </SelectItem>
                                  <SelectItem value="cancelled">
                                    Dibatalkan
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`schedule-${appointment.appointment_id}`}>
                                Tanggal &amp; Waktu
                              </Label>
                              <Input
                                id={`schedule-${appointment.appointment_id}`}
                                type="datetime-local"
                                value={mediate.scheduled_at}
                                onChange={(event) =>
                                  setMediate({
                                    ...mediate,
                                    scheduled_at: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`location-${appointment.appointment_id}`}>
                                Lokasi
                              </Label>
                              <Select
                                value={mediate.location}
                                onValueChange={(value) =>
                                  setMediate({
                                    ...mediate,
                                    location: value as MediateForm['location'],
                                  })
                                }
                              >
                                <SelectTrigger
                                  id={`location-${appointment.appointment_id}`}
                                  className="w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="online">Online</SelectItem>
                                  <SelectItem value="offline">
                                    Tatap muka
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`notes-${appointment.appointment_id}`}>
                                Catatan Mediasi
                              </Label>
                              <Textarea
                                id={`notes-${appointment.appointment_id}`}
                                value={mediate.notes}
                                onChange={(event) =>
                                  setMediate({ ...mediate, notes: event.target.value })
                                }
                                placeholder="Contoh: siswa hadir bersama orang tua."
                                rows={3}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setSelected(null)}
                              disabled={saving}
                            >
                              Batal
                            </Button>
                            <Button onClick={handleMediate} disabled={saving}>
                              {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
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