"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { IconBox } from "@/components/ui/icon-box";
import { StatusBadge } from "@/components/ui/status-badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AvatarUploadField } from "@/components/ui/avatar-upload";
import {
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/data-table";
import {
  Users,
  UploadCloud,
  RefreshCw,
  Search,
  Filter,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Pencil,
  Download,
  UserPlus,
  UserCheck,
  GraduationCap,
  ShieldCheck,
  Loader2,
  FileSpreadsheet,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import Papa from "papaparse";
import RolePermissionsManager from "@/components/admin/RolePermissionsManager";
import {
  ACCOUNT_ROLES,
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  type AccountRole,
  type LoginRole,
} from "@/lib/constants";

interface UserData {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  type: 'STAFF' | 'STUDENT';
  national_id?: string;
  gender?: string | null;
  phone_number?: string | null;
  /** Whether a profile photo exists — lets the table skip the image request. */
  has_photo?: boolean;
  /** Signed 512px WebP URL, or null. */
  avatar_url?: string | null;
  /** Signed 128px WebP URL for tables/lists, or null. */
  thumb_url?: string | null;
}

/** Label Bahasa Indonesia untuk gender (nilai API tetap MALE/FEMALE/OTHER). */
const GENDER_LABELS: Record<string, string> = {
  MALE: "Laki-laki",
  FEMALE: "Perempuan",
  OTHER: "Lainnya",
};

/** Label Bahasa Indonesia untuk nilai gender dari server. */
function genderLabel(value?: string | null): string | null {
  if (!value) return null;
  return GENDER_LABELS[value.toUpperCase()] ?? value;
}

export default function AdminUsersPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    role: "STUDENT" as AccountRole,
    national_id: "",
    password: "",
    gender: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [allUsersOpen, setAllUsersOpen] = useState(false);

  // Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<'full_name' | 'role'>('full_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Edit dialog state
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    role: "" as string,
    is_active: true,
    password: "",
    gender: "",
    phone_number: "",
    national_id: "",
  });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  // Delete confirmation state. `deleteConfirmText` must read exactly HAPUS before
  // the destructive button unlocks — a plain confirm dialog gets clicked through
  // because the button sits exactly where "Save" usually is.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchUsers = async (showToast = false) => {
    setIsLoadingUsers(true);
    try {
      const res = await apiClient<{ data?: UserData[] }>("/admin/users");
      if (res.success) {
        setUsers(res.data as any || []);
        if (showToast) toast.success("Direktori pengguna berhasil dimuat ulang.");
      } else {
        toast.error("Gagal memuat daftar pengguna.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan saat memuat daftar pengguna.");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers(false);
  }, []);

  const filteredAndSortedUsers = users
    .filter(user => {
      const matchesSearch = user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
                           (user.national_id?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      const factor = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'full_name') {
        return a.full_name.localeCompare(b.full_name) * factor;
      } else {
        return a.role.localeCompare(b.role) * factor;
      }
    });

  const activeCount = users.filter((u) => u.is_active).length;
  const studentCount = users.filter((u) => u.type === 'STUDENT').length;
  const staffCount = users.filter((u) => u.type !== 'STUDENT').length;

  const toggleSort = (field: 'full_name' | 'role') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  /** Ikon arah urut untuk header tabel yang bisa diklik. */
  const sortIcon = (field: 'full_name' | 'role') => {
    if (sortField !== field) return <ArrowUpDown className="size-3 opacity-40" />;
    return sortDirection === 'asc'
      ? <ChevronUp className="size-3" />
      : <ChevronDown className="size-3" />;
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || (!formData.email && formData.role !== 'STUDENT')) {
      toast.error("Mohon lengkapi semua kolom yang wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const body: any = {
        full_name: formData.full_name,
        email: formData.email,
        role: formData.role,
        national_id: formData.national_id || undefined,
        gender: formData.gender || undefined,
      };
      if (formData.password) body.password = formData.password;

      const res = await apiClient("/admin/users", {
        method: "POST",
        body,
      });

      if (res.success) {
        toast.success(`Pengguna ${formData.full_name} berhasil ditambahkan!`);
        setFormData({ full_name: "", email: "", role: "STUDENT", national_id: "", password: "", gender: "" });
        fetchUsers();
      } else {
        toast.error(res.error || "Gagal menambahkan pengguna.");
      }
    } catch (err) {
      toast.error("Terjadi kesalahan tak terduga.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (user: UserData) => {
    setEditUser(user);
    setEditForm({
      full_name: user.full_name,
      email: user.email || "",
      role: user.role,
      is_active: user.is_active,
      password: "",
      gender: user.gender || "",
      phone_number: user.phone_number || "",
      national_id: user.national_id || "",
    });
    setIsEditSubmitting(false);
  };

  const closeEditDialog = () => {
    setEditUser(null);
    setEditForm({ full_name: "", email: "", role: "", is_active: true, password: "", gender: "", phone_number: "", national_id: "" });
    // Reset the delete panel too, or reopening the dialog for the next user would
    // show "HAPUS" still typed and the destructive button armed.
    setShowDeleteConfirm(false);
    setDeleteConfirmText("");
  };

  const handleDelete = async () => {
    if (!editUser) return;
    if (deleteConfirmText.trim().toUpperCase() !== "HAPUS") {
      toast.error('Ketik HAPUS dengan huruf kapital untuk konfirmasi.');
      return;
    }
    setIsDeleting(true);
    try {
      const res = await apiClient(`/admin/users/${editUser.id}`, { method: "DELETE" });
      if (res.success) {
        toast.success(`Pengguna ${editUser.full_name} telah dihapus.`);
        closeEditDialog();
        fetchUsers();
      } else {
        toast.error(res.error || "Gagal menghapus pengguna.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan tak terduga saat menghapus pengguna.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editUser) return;
    if (!editForm.full_name) {
      toast.error("Nama lengkap wajib diisi.");
      return;
    }

    setIsEditSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        full_name: editForm.full_name,
      };
      // Only send email for non-STUDENT types
      if (editUser.type !== 'STUDENT') {
        if (editForm.email) body.email = editForm.email;
        body.role = editForm.role;
        body.is_active = editForm.is_active;
        body.gender = editForm.gender || null;
      } else {
        // Students: allow phone number to be set/updated here (used for WAHA notifications)
        body.phone_number = editForm.phone_number || null;
      }
      // NIK — sent for all user types (required for staff booking)
      body.national_id = editForm.national_id || null;
      if (editForm.password) body.password = editForm.password;

      const res = await apiClient(`/admin/users/${editUser.id}`, {
        method: "PUT",
        body,
      });

      if (res.success) {
        toast.success(`Pengguna ${editForm.full_name} berhasil diperbarui.`);
        closeEditDialog();
        fetchUsers();
      } else {
        toast.error(res.error || "Gagal memperbarui pengguna.");
      }
    } catch (err) {
      toast.error("Terjadi kesalahan tak terduga.");
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,full_name,email,role,national_id\nJohn Doe,john.doe@example.edu,STUDENT,123456789\nJane Smith,jane.smith@example.edu,TEACHER,987654321";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "user_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Template berhasil diunduh.");
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      toast.error("Pilih berkas CSV terlebih dahulu.");
      return;
    }

    setIsBulkSubmitting(true);
    Papa.parse(bulkFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const seenEmails = new Set<string>();
          let skippedLocal = 0;

          // Validate and clean data — skip rows missing name / with invalid or
          // duplicate email; upload the rest.
          //
          // STUDENT rows are the exception on both counts: a student is a record
          // in `students`, not a login account, so it needs no email (the
          // optional `parent_email`/`email` column is stored as
          // students.parent_email). Requiring a valid email silently dropped
          // every student row from a CSV before.
          const KNOWN_ROLES = new Set<string>(ACCOUNT_ROLES as readonly string[]);
          const parsedUsers = (results.data as any[])
            .map((row: any) => ({
              full_name: row.full_name?.trim(),
              email: row.email?.trim() || undefined,
              role: (row.role?.trim().toUpperCase() || "STUDENT") as AccountRole,
              national_id: row.national_id?.trim() || undefined,
              gender: row.gender?.trim() || undefined,
              phone_number: row.phone_number?.trim() || undefined,
              date_of_birth: row.date_of_birth?.trim() || undefined,
              parent_email: row.parent_email?.trim() || undefined,
            }))
            .filter((u) => {
              // Drop rows naming a role the backend would reject outright —
              // the bulk endpoint is one transaction, so one bad role would
              // roll back the entire batch.
              if (!KNOWN_ROLES.has(u.role)) {
                skippedLocal++;
                return false;
              }

              const emailLower = u.email?.toLowerCase();
              // Staff need a unique, valid email; students need neither.
              if (u.role === "STUDENT") {
                if (!u.full_name) {
                  skippedLocal++;
                  return false;
                }
                return true;
              }
              if (!u.full_name || !emailLower || !emailRegex.test(emailLower) || seenEmails.has(emailLower)) {
                skippedLocal++;
                return false;
              }
              seenEmails.add(emailLower);
              return true;
            });

          if (parsedUsers.length === 0) {
            toast.error("Tidak ada pengguna valid di berkas CSV. Periksa formatnya.");
            setIsBulkSubmitting(false);
            return;
          }

          toast.info(`Mengunggah ${parsedUsers.length} pengguna…`);

          const res = await apiClient<{ created: number, duplicates: number, invalid?: number, failed?: number }>("/admin/users/bulk", {
            method: "POST",
            body: { users: parsedUsers },
          });

          if (res.success && res.data) {
            const { created, duplicates, invalid = 0, failed = 0 } = res.data;
            const skippedTotal = skippedLocal + invalid;
            let msg = `Impor massal selesai! ${created} pengguna ditambahkan.`;
            if (duplicates) msg += ` ${duplicates} duplikat dilewati.`;
            if (skippedTotal) msg += ` ${skippedTotal} baris tidak valid diabaikan.`;
            if (failed) msg += ` ${failed} baris gagal diproses.`;
            toast.success(msg);
            setBulkFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            fetchUsers();
          } else {
            toast.error(res.error || "Gagal mengimpor pengguna secara massal.");
          }
        } catch (err) {
          toast.error("Terjadi kesalahan tak terduga saat impor.");
        } finally {
          setIsBulkSubmitting(false);
        }
      },
      error: (error) => {
        toast.error(`Gagal membaca berkas CSV: ${error.message}`);
        setIsBulkSubmitting(false);
      }
    });
  };

  const roleColumns = useMemo(
    () =>
      ACCOUNT_ROLES.map((r) => (
        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
      )),
    []
  );

  return (
    <div className="space-y-6">
      {/* ══════════════ HEADER ══════════════ */}
      <PageHeader
        title="Manajemen Pengguna"
        description="Tambahkan siswa, guru, dan staf baru ke dalam organisasi Anda. Kata sandi awal: Welcome123!"
        actions={
          <Button
            variant="outline"
            onClick={() => fetchUsers(true)}
            disabled={isLoadingUsers}
          >
            <RefreshCw className={isLoadingUsers ? "size-4 animate-spin" : "size-4"} />
            Muat Ulang
          </Button>
        }
      />

      {/* ══════════════ STATISTIK ══════════════ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Pengguna"
          value={users.length}
          hint="Seluruh akun di direktori sekolah"
          icon={<Users className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Akun Aktif"
          value={activeCount}
          hint="Akun yang dapat masuk ke sistem"
          icon={<UserCheck className="size-5" />}
          iconTone="green"
          progress={users.length > 0 ? Math.round((activeCount / users.length) * 100) : 0}
          progressLabel="Persentase akun aktif"
        />
        <StatCard
          label="Siswa"
          value={studentCount}
          hint="Siswa terdaftar pada direktori"
          icon={<GraduationCap className="size-5" />}
          iconTone="purple"
        />
        <StatCard
          label="Staf & Guru"
          value={staffCount}
          hint="Akun guru, konselor, dan administrasi"
          icon={<ShieldCheck className="size-5" />}
          iconTone="teal"
        />
      </div>

      {/* ══════════════ TAMBAH & IMPOR ══════════════ */}
      <Tabs defaultValue="manual">
        <TabsList>
          <TabsTrigger value="manual">
            <UserPlus />
            Tambah Pengguna
          </TabsTrigger>
          <TabsTrigger value="bulk">
            <FileSpreadsheet />
            Impor CSV
          </TabsTrigger>
        </TabsList>

        {/* ── MANUAL ENTRY ── */}
        <TabsContent value="manual">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <IconBox tone="green">
                  <UserPlus />
                </IconBox>
                <div className="space-y-1">
                  <CardTitle>Tambah Pengguna Manual</CardTitle>
                  <CardDescription>
                    Tambahkan satu pengguna ke direktori sekolah secara manual.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <form onSubmit={handleManualSubmit}>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new_full_name">Nama Lengkap *</Label>
                  <Input
                    id="new_full_name"
                    placeholder="cth. Budi Santoso"
                    value={formData.full_name}
                    onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new_email">
                    Alamat Email {formData.role !== 'STUDENT' && '*'}
                  </Label>
                  <Input
                    id="new_email"
                    type="email"
                    placeholder="budi@sekolah.sch.id"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    required={formData.role !== 'STUDENT'}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new_role">Peran *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => setFormData({ ...formData, role: v as AccountRole })}
                    items={ROLE_LABELS}
                  >
                    <SelectTrigger id="new_role" className="w-full">
                      <SelectValue placeholder="Pilih peran" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleColumns}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new_gender">Jenis Kelamin (Opsional)</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(v) => setFormData({ ...formData, gender: v ?? "" })}
                  >
                    <SelectTrigger id="new_gender" className="w-full">
                      <SelectValue placeholder="Pilih jenis kelamin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Laki-laki</SelectItem>
                      <SelectItem value="FEMALE">Perempuan</SelectItem>
                      <SelectItem value="OTHER">Lainnya</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new_national_id">NIK / Nomor Induk (Opsional)</Label>
                  <Input
                    id="new_national_id"
                    placeholder="cth. 123456789"
                    value={formData.national_id}
                    onChange={e => setFormData({ ...formData, national_id: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new_password">Kata Sandi (Opsional — default: Welcome123!)</Label>
                  <Input
                    id="new_password"
                    type="password"
                    placeholder="Kosongkan untuk memakai kata sandi default"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                  {isSubmitting ? "Menambahkan…" : "Tambah Pengguna"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* ── BULK UPLOAD ── */}
        <TabsContent value="bulk">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <IconBox tone="blue">
                  <UploadCloud />
                </IconBox>
                <div className="space-y-1">
                  <CardTitle>Impor CSV Massal</CardTitle>
                  <CardDescription>
                    Tambahkan banyak siswa dan staf sekaligus menggunakan berkas CSV.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  bulkFile
                    ? 'border-primary bg-primary-softer'
                    : 'border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50'
                }`}
              >
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={e => {
                    const file = e.target.files?.[0] || null;
                    setBulkFile(file);
                    if (file) toast.success(`Berkas dipilih: ${file.name}`);
                  }}
                />
                <IconBox tone={bulkFile ? "blue" : "slate"} size="lg">
                  <UploadCloud />
                </IconBox>
                {bulkFile ? (
                  <>
                    <p className="text-sm font-semibold text-primary">{bulkFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(bulkFile.size / 1024).toFixed(2)} KB
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-heading">
                      Klik untuk memilih berkas dari komputer Anda
                    </p>
                    <p className="text-xs text-muted-foreground">Format berkas harus .csv</p>
                  </>
                )}
              </button>

              <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/40 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-secondary-text">Butuh format yang benar?</span>
                <Button variant="outline" size="sm" onClick={downloadTemplate} className="self-start sm:self-auto">
                  <Download className="size-4" />
                  Unduh Template
                </Button>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                disabled={!bulkFile || isBulkSubmitting}
                onClick={handleBulkUpload}
              >
                {isBulkSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UploadCloud className="size-4" />
                )}
                {isBulkSubmitting ? "Mengunggah…" : "Buat Pengguna Massal"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ══════════════ DAFTAR PENGGUNA ══════════════ */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <IconBox tone="blue">
                <Users />
              </IconBox>
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAllUsersOpen(o => !o)}
                    aria-expanded={allUsersOpen}
                    aria-label={allUsersOpen ? "Tutup daftar pengguna" : "Buka daftar pengguna"}
                    className="flex items-center gap-2 rounded-lg text-left"
                  >
                    {allUsersOpen ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    Direktori Pengguna
                  </button>
                  <StatusBadge tone="neutral" dot={false} label={`${users.length} akun`} />
                </CardTitle>
                <CardDescription>
                  Lihat seluruh siswa dan staf yang tercatat dalam sistem.
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchUsers(true)}
              disabled={isLoadingUsers}
              className="shrink-0 self-start lg:self-auto"
            >
              <RefreshCw className={isLoadingUsers ? "size-4 animate-spin" : "size-4"} />
              Muat Ulang
            </Button>
          </div>
        </CardHeader>

        {allUsersOpen && (
          <CardContent className="space-y-5">
            {/* Filter Bar */}
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Cari pengguna"
                  placeholder="Cari berdasarkan nama, email, atau NIK…"
                  className="pl-9"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="w-full md:w-56">
                <Select
                  value={roleFilter}
                  onValueChange={(value) => setRoleFilter(value ?? 'ALL')}
                  items={{ ALL: 'Semua Peran', ...ROLE_LABELS }}
                >
                  <SelectTrigger aria-label="Saring berdasarkan peran" className="w-full">
                    <Filter className="size-4 text-muted-foreground" />
                    <SelectValue placeholder="Saring berdasarkan peran" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Peran</SelectItem>
                    {roleColumns}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoadingUsers ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <Loader2 className="size-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Memuat pengguna…</p>
              </div>
            ) : users.length === 0 ? (
              <EmptyState
                icon={<Users />}
                title="Belum ada pengguna"
                description="Direktori masih kosong. Mulai dengan menambahkan pengguna di atas."
              />
            ) : filteredAndSortedUsers.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title="Pengguna tidak ditemukan"
                description="Tidak ada pengguna yang cocok dengan pencarian atau filter peran Anda."
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setRoleFilter("ALL");
                    }}
                  >
                    Bersihkan filter
                  </Button>
                }
              />
            ) : (
              <DataTable>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell
                      scope="col"
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort('full_name')}
                    >
                      <span className="flex items-center gap-1.5">
                        Nama Lengkap
                        {sortIcon('full_name')}
                      </span>
                    </TableHeaderCell>
                    <TableHeaderCell scope="col">NIK / ID Akun</TableHeaderCell>
                    <TableHeaderCell scope="col">Tipe</TableHeaderCell>
                    <TableHeaderCell
                      scope="col"
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort('role')}
                    >
                      <span className="flex items-center gap-1.5">
                        Peran
                        {sortIcon('role')}
                      </span>
                    </TableHeaderCell>
                    <TableHeaderCell scope="col">Email</TableHeaderCell>
                    <TableHeaderCell scope="col">Status</TableHeaderCell>
                    <TableHeaderCell scope="col">Telepon</TableHeaderCell>
                    <TableHeaderCell scope="col" className="text-right">Bergabung</TableHeaderCell>
                    <TableHeaderCell scope="col" className="text-center">Aksi</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAndSortedUsers.map((user) => {
                    const isStudent = user.type === 'STUDENT';
                    return (
                      <TableRow key={user.id} interactive>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              name={user.full_name}
                              src={user.has_photo ? user.thumb_url : null}
                              size="md"
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-heading">{user.full_name}</div>
                              {user.gender && (
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {genderLabel(user.gender)}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-secondary-text">
                            {isStudent ? (user.national_id || 'tidak ada NIK') : user.id.slice(0, 8)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={isStudent ? "warning" : "info"}
                            dot={false}
                            label={isStudent ? "Siswa" : "Staf"}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone="neutral" dot={false} label={user.role.replace(/_/g, " ")} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.email || <span className="text-muted-foreground/60">tidak ada email</span>}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={user.is_active ? "success" : "neutral"}
                            label={user.is_active ? "Aktif" : "Nonaktif"}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.phone_number || <span className="text-muted-foreground/60">tidak ada</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEditDialog(user)}
                            aria-label={`Ubah pengguna ${user.full_name}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </DataTable>
            )}
          </CardContent>
        )}
      </Card>

      {/* ══════════════ ROLE PERMISSIONS MANAGER ══════════════ */}
      <RolePermissionsManager />

      {/* ══════════════ DIALOG UBAH PENGGUNA ══════════════ */}
      {/* While the delete confirmation is open, Esc/backdrop must dismiss THAT
          dialog only. Without this guard Base UI closes the topmost dialog and
          then fires this handler too, so the edit form would vanish along with
          the user's half-typed confirmation. */}
      <Dialog
        open={!!editUser}
        onOpenChange={(open) => {
          if (!open && !showDeleteConfirm) closeEditDialog();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ubah Pengguna</DialogTitle>
            <DialogDescription>
              Perbarui data {editUser?.full_name || "pengguna ini"}. Kosongkan kata sandi bila tidak ingin
              mengubahnya.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Foto profil — upload singkat, terpisah dari penyimpanan form di bawah */}
            {editUser && (
              <AvatarUploadField
                accountId={editUser.id}
                accountName={editForm.full_name || editUser.full_name}
                currentUrl={editUser.has_photo ? editUser.thumb_url : null}
                onChanged={({ avatar_url, thumb_url }) => {
                  setEditUser((prev) =>
                    prev
                      ? { ...prev, has_photo: Boolean(thumb_url), avatar_url, thumb_url }
                      : prev,
                  );
                }}
              />
            )}

            <div className="h-px bg-border" />

            <div className="space-y-2">
              <Label htmlFor="edit_full_name">Nama Lengkap *</Label>
              <Input
                id="edit_full_name"
                value={editForm.full_name}
                onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                placeholder="Nama lengkap"
              />
            </div>

            {editUser?.type !== 'STUDENT' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit_email">Alamat Email</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="email@sekolah.sch.id"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_role">Peran</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={v => setEditForm({ ...editForm, role: v ?? '' })}
                    items={ROLE_LABELS}
                  >
                    <SelectTrigger id="edit_role" className="w-full">
                      <SelectValue placeholder="Pilih peran" />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_gender">Jenis Kelamin (Opsional)</Label>
                  <Select
                    value={editForm.gender}
                    onValueChange={(v) => setEditForm({ ...editForm, gender: v ?? "" })}
                  >
                    <SelectTrigger id="edit_gender" className="w-full">
                      <SelectValue placeholder="Pilih jenis kelamin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Laki-laki</SelectItem>
                      <SelectItem value="FEMALE">Perempuan</SelectItem>
                      <SelectItem value="OTHER">Lainnya</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_national_id">NIK / Nomor Induk *</Label>
                  <Input
                    id="edit_national_id"
                    value={editForm.national_id}
                    onChange={e => setEditForm({ ...editForm, national_id: e.target.value })}
                    placeholder="cth. 1234567890123456"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Wajib diisi untuk pemesanan staf melalui kode QR.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
                  <Label htmlFor="is_active" className="cursor-pointer">
                    Akun aktif
                  </Label>
                  <Switch
                    id="is_active"
                    checked={editForm.is_active}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_password">Kata Sandi Baru (Opsional)</Label>
                  <Input
                    id="edit_password"
                    type="password"
                    value={editForm.password}
                    onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="Kosongkan untuk mempertahankan kata sandi saat ini"
                  />
                  <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit_phone">Nomor Telepon (Opsional)</Label>
                  <Input
                    id="edit_phone"
                    type="tel"
                    value={editForm.phone_number}
                    onChange={e => setEditForm({ ...editForm, phone_number: e.target.value })}
                    placeholder="cth. +628****7890"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sertakan kode negara (cth. +62 untuk Indonesia). Dipakai untuk notifikasi janji temu
                    melalui WhatsApp.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_student_national_id">NIK / Nomor Induk *</Label>
                  <Input
                    id="edit_student_national_id"
                    value={editForm.national_id}
                    onChange={e => setEditForm({ ...editForm, national_id: e.target.value })}
                    placeholder="cth. 1234567890123456"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Wajib diisi untuk pemesanan staf melalui kode QR.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            {/* Zona hapus — dijauhkan dari tombol "Simpan" supaya tidak terklik.
                Konfirmasi-delete hidup di dialog terpisah (lihat bawah), jadi
                lebar footer ini tidak pernah berubah. */}
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(true)}
              className="border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive/10 sm:mr-auto"
            >
              <Trash2 className="size-4" />
              Hapus Pengguna
            </Button>
            <Button variant="outline" onClick={closeEditDialog}>
              Batal
            </Button>
            <Button onClick={handleEditSubmit} disabled={isEditSubmitting || isDeleting}>
              {isEditSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
              {isEditSubmitting ? "Menyimpan…" : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ DIALOG KONFIRMASI HAPUS ══════════════ */}
      {/* Nested inside the edit dialog (Base UI tracks nested dialogs via
          `nestedOpenDialogCount`, so the outer dialog stays open and keeps its
          form state behind the backdrop). Keeping it separate means opening the
          confirmation no longer reflows the edit form underneath. */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setShowDeleteConfirm(false);
            setDeleteConfirmText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <TriangleAlert className="size-4 text-destructive" />
              </span>
              Hapus {editUser?.full_name}?
            </DialogTitle>
            <DialogDescription>
              Akun <strong>{editUser?.full_name}</strong> tidak bisa dipakai lagi setelah dihapus
              {editUser?.type === 'STUDENT'
                ? ', termasuk riwayat kasusnya.'
                : '. Tindakan ini tidak bisa dibatalkan.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm" className="text-xs">
              Ketik <span className="font-bold text-destructive">HAPUS</span> untuk konfirmasi
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="HAPUS"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeleteConfirmText("");
              }}
              disabled={isDeleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              // Case-insensitive to match the handler, so the button never looks
              // broken for someone who typed "hapus".
              disabled={deleteConfirmText.trim().toUpperCase() !== "HAPUS" || isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {isDeleting ? "Menghapus…" : "Hapus Permanen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}