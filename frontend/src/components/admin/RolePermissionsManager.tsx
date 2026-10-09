"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck,
  RefreshCw,
  Save,
  ChevronDown,
  ChevronRight,
  Loader2,
  KeyRound,
  ListChecks,
  Layers,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { LOGIN_ROLES } from "@/lib/constants";
import { IconBox } from "@/components/ui/icon-box";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";

// ─── Config ────────────────────────────────────────────────────────────────────

// Mirrors `ROLE_NAMES` in shared/types/database.ts (the frontend cannot import
// @swims/shared — see frontend/src/lib/constants.ts). `STUDENT` is absent on
// purpose: students have no login and no permission matrix.
const ROLES = LOGIN_ROLES;

/** Label Bahasa Indonesia untuk setiap peran (nilai API tetap `LOGIN_ROLES`). */
const ROLE_LABELS_ID: Record<string, string> = {
  TEACHER: "Guru",
  COUNSELOR: "Konselor",
  SCHOOL_NURSE: "Perawat Sekolah",
  SCHOOL_HEAD: "Kepala Sekolah",
  BOARD_MEMBER: "Anggota Dewan",
  IT_ADMIN: "Admin TI",
  PERSONAL: "Personal",
  PSYCHOLOGIST: "Psikolog",
};

// Must cover every resource the backend enforces with checkPermission(), otherwise
// those rows are invisible here and can only be changed via SQL.
const RESOURCES: { key: string; label: string; hint: string }[] = [
  { key: "cases", label: "Kasus", hint: "Pengelolaan berkas kasus siswa" },
  { key: "incidents", label: "Insiden", hint: "Laporan insiden dari siswa dan kelas" },
  { key: "interventions", label: "Intervensi", hint: "Rencana dan tindak lanjut kasus" },
  { key: "media_assets", label: "Aset Media", hint: "Foto, video, dan lampiran Berkas" },
  { key: "alerts", label: "Peringatan", hint: "Peringatan otomatis sistem" },
  { key: "reports", label: "Laporan", hint: "Rekap dan laporan periodik" },
  { key: "consents", label: "Persetujuan", hint: "Persetujuan orang tua dan siswa" },
  { key: "audit_logs", label: "Log Audit", hint: "Riwayat perubahan data" },
  { key: "positive_observations", label: "Observasi Positif", hint: "Catatan perilaku positif" },
  { key: "students", label: "Siswa", hint: "Data induk siswa" },
  { key: "appointments", label: "Janji Temu", hint: "Jadwal konseling dan pertemuan" },
  { key: "availability", label: "Slot Ketersediaan", hint: "Jam layanan tiap staf" },
  { key: "quisioner", label: "Kuesioner", hint: "Kuesioner siswa" },
  { key: "staff_quisioner", label: "Kuesioner Staf", hint: "Kuesioner karyawan" },
  { key: "employee_counseling", label: "Konseling Karyawan", hint: "Layanan konseling staf" },
  { key: "admin", label: "Administrasi", hint: "Pengaturan sistem lanjutan" },
];

const CRUD_ACTIONS = ["create", "read", "update", "delete"] as const;
// The 'admin' resource additionally exposes a 'manage' action.
const ADMIN_EXTRA_ACTIONS = ["manage"] as const;

const ACTION_LABELS: Record<string, string> = {
  create: "Tambah",
  read: "Lihat",
  update: "Ubah",
  delete: "Hapus",
  manage: "Kelola",
};

type RoleSlice = Record<string, Record<string, boolean>>;
type Matrix = Record<string, RoleSlice>;

function actionsForResource(resource: string): string[] {
  if (resource === "admin") return [...CRUD_ACTIONS, ...ADMIN_EXTRA_ACTIONS];
  return [...CRUD_ACTIONS];
}

function roleLabel(role: string): string {
  return ROLE_LABELS_ID[role] ?? role;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function RolePermissionsManager() {
  const [matrix, setMatrix] = useState<Matrix>({});
  const [selectedRole, setSelectedRole] = useState<string>(ROLES[0]);
  const [draft, setDraft] = useState<RoleSlice>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [open, setOpen] = useState(false);

  const loadMatrix = async (showToast = false) => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data?: Matrix }>("/admin/role-permissions");
      if (res.success && res.data) {
        setMatrix(res.data as Matrix);
        if (showToast) toast.success("Izin peran berhasil dimuat ulang.");
      } else {
        toast.error("Gagal memuat izin peran.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan saat memuat izin peran.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load once
  useEffect(() => {
    loadMatrix(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the matrix or selected role changes, copy the role slice into the editable draft
  useEffect(() => {
    const slice = matrix[selectedRole] ?? {};
    // Ensure every configured resource/action is present in the draft
    const next: RoleSlice = {};
    for (const r of RESOURCES) {
      next[r.key] = { ...(slice[r.key] ?? {}) };
    }
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, selectedRole]);

  const toggle = (resource: string, action: string, value: boolean) => {
    setDraft((prev) => ({
      ...prev,
      [resource]: {
        ...(prev[resource] ?? {}),
        [action]: value,
      },
    }));
  };

  const isDirty = useMemo(() => {
    const base = matrix[selectedRole] ?? {};
    const baseNorm: RoleSlice = {};
    for (const r of RESOURCES) baseNorm[r.key] = { ...(base[r.key] ?? {}) };
    return JSON.stringify(baseNorm) !== JSON.stringify(draft);
  }, [matrix, selectedRole, draft]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await apiClient<RoleSlice>(`/admin/role-permissions/${selectedRole}`, {
        method: "PUT",
        body: draft,
      });
      if (res.success && res.data) {
        setMatrix((prev) => ({ ...prev, [selectedRole]: res.data as RoleSlice }));
        toast.success(`Izin peran ${roleLabel(selectedRole)} berhasil diperbarui.`);
      } else {
        toast.error(res.error || "Gagal memperbarui izin.");
      }
    } catch (err) {
      toast.error("Terjadi kesalahan tak terduga.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await apiClient<RoleSlice>(`/admin/role-permissions/${selectedRole}/reset`, {
        method: "POST",
        body: {},
      });
      if (res.success && res.data) {
        setMatrix((prev) => ({ ...prev, [selectedRole]: res.data as RoleSlice }));
        toast.success(`Izin peran ${roleLabel(selectedRole)} dikembalikan ke pengaturan awal.`);
      } else {
        toast.error(res.error || "Gagal mengembalikan izin ke pengaturan awal.");
      }
    } catch (err) {
      toast.error("Terjadi kesalahan tak terduga.");
    } finally {
      setIsResetting(false);
    }
  };

  const totalPermissionSlots = RESOURCES.reduce(
    (sum, r) => sum + actionsForResource(r.key).length,
    0
  );

  const enabledCount = useMemo(() => {
    let count = 0;
    for (const r of RESOURCES) {
      const actions = actionsForResource(r.key);
      for (const a of actions) {
        if (draft[r.key]?.[a]) count += 1;
      }
    }
    return count;
  }, [draft]);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <IconBox tone="purple">
              <ShieldCheck />
            </IconBox>
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  aria-label={open ? "Tutup pengaturan izin peran" : "Buka pengaturan izin peran"}
                  className="flex items-center gap-2 rounded-lg text-left"
                >
                  {open ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  Kelola Izin Peran
                </button>
                <StatusBadge tone="neutral" dot={false} label={`${ROLES.length} peran`} />
              </CardTitle>
              <CardDescription>
                Atur apa saja yang boleh dilakukan setiap peran di sistem. Perubahan langsung berlaku untuk
                semua pengguna dengan peran tersebut. Aturan pembatasan cakupan (misalnya guru hanya melihat
                kelasnya sendiri) tetap berlaku di atas pengaturan ini.
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadMatrix(true)}
            disabled={isLoading}
            className="shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
            Muat Ulang
          </Button>
        </div>
      </CardHeader>

      {open && (
        <>
          <CardContent className="space-y-6">
            {/* ── Ringkasan ── */}
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Peran Dikelola"
                value={ROLES.length}
                hint="Peran yang memiliki matriks izin"
                icon={<ShieldCheck className="size-5" />}
                iconTone="purple"
              />
              <StatCard
                label="Modul Akses"
                value={RESOURCES.length}
                hint="Jenis data yang diatur haknya"
                icon={<Layers className="size-5" />}
                iconTone="blue"
              />
              <StatCard
                label="Izin Aktif"
                value={enabledCount}
                hint={`Peran ${roleLabel(selectedRole)}`}
                icon={<ListChecks className="size-5" />}
                iconTone="green"
                progress={
                  totalPermissionSlots > 0
                    ? Math.round((enabledCount / totalPermissionSlots) * 100)
                    : 0
                }
                progressLabel="Persentase izin aktif"
              />
              <StatCard
                label="Slot Izin"
                value={totalPermissionSlots}
                hint="Total kombinasi modul dan aksi"
                icon={<KeyRound className="size-5" />}
                iconTone="slate"
              />
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <Loader2 className="size-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Memuat matriks izin…</p>
              </div>
            ) : (
              <Tabs
                value={selectedRole}
                onValueChange={(v: string) => setSelectedRole(v ?? selectedRole)}
              >
                <TabsList className="w-full sm:w-fit">
                  {ROLES.map((r) => (
                    <TabsTrigger key={r} value={r}>
                      {roleLabel(r)}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {ROLES.map((r) => (
                  <TabsContent key={r} value={r}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {RESOURCES.map((res) => {
                        const actions = actionsForResource(res.key);
                        const enabled = actions.filter((a) => draft[res.key]?.[a]).length;
                        return (
                          <div
                            key={res.key}
                            className="rounded-2xl border border-border bg-card p-5 shadow-card"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <IconBox
                                  tone={enabled > 0 ? "blue" : "slate"}
                                  size="sm"
                                  className="mt-0.5"
                                >
                                  {res.key === "admin" ? (
                                    <ShieldCheck className="size-4" />
                                  ) : (
                                    <ClipboardCheck className="size-4" />
                                  )}
                                </IconBox>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-heading">{res.label}</p>
                                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                    {res.hint}
                                  </p>
                                </div>
                              </div>
                              <StatusBadge
                                tone={enabled === actions.length ? "success" : enabled > 0 ? "info" : "neutral"}
                                dot={false}
                                label={`${enabled}/${actions.length}`}
                              />
                            </div>

                            <div className="mt-4 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
                              {actions.map((a) => (
                                <label
                                  key={a}
                                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 transition-colors hover:bg-muted/70"
                                >
                                  <span className="text-[0.8125rem] font-medium text-secondary-text">
                                    {ACTION_LABELS[a] ?? a}
                                  </span>
                                  <Switch
                                    checked={Boolean(draft[res.key]?.[a])}
                                    onCheckedChange={(v) => toggle(res.key, a, v)}
                                    aria-label={`${ACTION_LABELS[a] ?? a} — ${res.label}`}
                                    disabled={r !== selectedRole}
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>

          <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isResetting || isSaving || isLoading}
              className="sm:mr-auto"
            >
              <RefreshCw className={isResetting ? "size-4 animate-spin" : "size-4"} />
              Kembalikan ke Pengaturan Awal
            </Button>
            <p className="text-xs text-muted-foreground">
              {isDirty
                ? `Ada perubahan pada izin peran ${roleLabel(selectedRole)} yang belum disimpan.`
                : `Izin peran ${roleLabel(selectedRole)} sudah tersimpan.`}
            </p>
            <Button onClick={handleSave} disabled={!isDirty || isSaving || isResetting || isLoading}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isSaving ? "Menyimpan…" : "Simpan Perubahan"}
            </Button>
          </CardFooter>
        </>
      )}
    </Card>
  );
}