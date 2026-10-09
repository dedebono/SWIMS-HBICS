"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DataTable,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/data-table";
import {
  UserCircle,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  Users,
  UserCheck,
  UserMinus,
  Loader2,
  Upload,
  X,
} from "lucide-react";

interface SchoolPsychologist {
  psychologist_id: string;
  user_id?: string | null;
  full_name: string;
  email?: string | null;
  expertise: string;
  consultation_fee: number;
  photo_url: string | null;
  is_active: boolean;
  has_profile?: boolean;
  created_at: string;
  updated_at: string;
}

const formatRupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export default function AdminPsychologistsPage() {
  const [psychologists, setPsychologists] = useState<SchoolPsychologist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Add/Edit sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPsychologist, setEditingPsychologist] = useState<SchoolPsychologist | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    expertise: "",
    consultation_fee: "",
    photo_url: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [psychologistToDelete, setPsychologistToDelete] = useState<SchoolPsychologist | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchPsychologists = useCallback(async (showToast = false) => {
    setLoading(true);
    try {
      const res = await apiClient<SchoolPsychologist[]>("/admin/psychologists");
      if (res.success) {
        setPsychologists(res.data ?? []);
        if (showToast) toast.success("Daftar psikolog berhasil diperbarui.");
      } else {
        toast.error(res.error || "Gagal memuat daftar psikolog.");
      }
    } catch {
      toast.error("Terjadi kesalahan saat memuat daftar psikolog.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPsychologists(false);
  }, [fetchPsychologists]);

  const filteredPsychologists = psychologists.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.expertise.toLowerCase().includes(q)
    );
  });

  const activeCount = psychologists.filter((p) => p.is_active).length;
  const inactiveCount = psychologists.filter((p) => !p.is_active).length;

  const openAddSheet = () => {
    setEditingPsychologist(null);
    setFormData({
      full_name: "",
      email: "",
      password: "",
      expertise: "",
      consultation_fee: "",
      photo_url: "",
    });
    setSheetOpen(true);
  };

  const openEditSheet = (p: SchoolPsychologist) => {
    setEditingPsychologist(p);
    setFormData({
      full_name: p.full_name,
      email: p.email ?? "",
      password: "",
      expertise: p.expertise,
      consultation_fee: String(p.consultation_fee),
      photo_url: p.photo_url ?? "",
    });
    setSheetOpen(true);
  };

  /** Read the picked image into a data URL so it persists in photo_url. */
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Berkas harus berupa gambar.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran foto maksimal 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({ ...prev, photo_url: String(reader.result) }));
    };
    reader.onerror = () => toast.error("Gagal membaca berkas foto.");
    reader.readAsDataURL(file);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingPsychologist(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.expertise || !formData.consultation_fee) {
      toast.error("Nama, bidang keahlian, dan biaya konsultasi wajib diisi.");
      return;
    }

    const fee = Number(formData.consultation_fee);
    if (isNaN(fee) || fee < 0) {
      toast.error("Biaya konsultasi harus berupa angka positif.");
      return;
    }

    // New psychologists need a login account; edits reuse the existing one.
    if (!editingPsychologist) {
      if (!formData.email.trim()) {
        toast.error("Email wajib diisi untuk membuat akun psikolog.");
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(formData.email.trim())) {
        toast.error("Format email tidak valid.");
        return;
      }
      if (formData.password && formData.password.length < 6) {
        toast.error("Kata sandi minimal 6 karakter.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const body = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim() || undefined,
        password: formData.password || undefined,
        expertise: formData.expertise.trim(),
        consultation_fee: fee,
        photo_url: formData.photo_url.trim() || null,
      };

      let res;
      if (editingPsychologist) {
        res = await apiClient(`/admin/psychologists?id=${editingPsychologist.psychologist_id}`, {
          method: "PUT",
          body,
        });
      } else {
        res = await apiClient("/admin/psychologists", { method: "POST", body });
      }

      if (res.success) {
        toast.success(editingPsychologist ? "Psikolog berhasil diperbarui." : "Psikolog berhasil ditambahkan.");
        closeSheet();
        fetchPsychologists();
      } else {
        toast.error(res.error || "Gagal menyimpan psikolog.");
      }
    } catch {
      toast.error("Terjadi kesalahan saat menyimpan psikolog.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = (p: SchoolPsychologist) => {
    setPsychologistToDelete(p);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!psychologistToDelete) return;
    setIsDeleting(true);
    try {
      const res = await apiClient(`/admin/psychologists?id=${psychologistToDelete.psychologist_id}`, {
        method: "DELETE",
      });
      if (res.success) {
        toast.success("Psikolog berhasil dihapus.");
        setDeleteDialogOpen(false);
        setPsychologistToDelete(null);
        fetchPsychologists();
      } else {
        toast.error(res.error || "Gagal menghapus psikolog.");
      }
    } catch {
      toast.error("Terjadi kesalahan saat menghapus psikolog.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kelola Psikolog Sekolah"
        description="Tambah, ubah, atau hapus psikolog yang dapat direkomendasikan kepada siswa."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => fetchPsychologists(true)}
              disabled={loading}
            >
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
              Muat Ulang
            </Button>
            <Button onClick={openAddSheet}>
              <Plus className="size-4" />
              Tambah Psikolog
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Psikolog"
          value={psychologists.length}
          hint="Seluruh psikolog yang terdaftar di sekolah"
          icon={<Users className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Psikolog Aktif"
          value={activeCount}
          hint="Dapat direkomendasikan kepada siswa"
          icon={<UserCheck className="size-5" />}
          iconTone="green"
          progress={
            psychologists.length > 0
              ? Math.round((activeCount / psychologists.length) * 100)
              : 0
          }
          progressLabel="Persentase psikolog aktif"
        />
        <StatCard
          label="Psikolog Nonaktif"
          value={inactiveCount}
          hint="Disembunyikan dari daftar rekomendasi"
          icon={<UserMinus className="size-5" />}
          iconTone="slate"
          progress={
            psychologists.length > 0
              ? Math.round((inactiveCount / psychologists.length) * 100)
              : 0
          }
          progressLabel="Persentase psikolog nonaktif"
        />
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Daftar Psikolog</CardTitle>
              <CardDescription>
                Menampilkan {filteredPsychologists.length} dari {psychologists.length} psikolog.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Cari psikolog"
                placeholder="Cari nama atau keahlian…"
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Memuat daftar psikolog…</p>
            </div>
          ) : filteredPsychologists.length === 0 ? (
            <EmptyState
              icon={searchQuery ? <Search /> : <UserCircle />}
              title={searchQuery ? "Psikolog tidak ditemukan" : "Belum ada psikolog"}
              description={
                searchQuery
                  ? "Tidak ada psikolog yang cocok dengan kata kunci pencarian Anda. Coba kata kunci lain."
                  : "Anda belum memiliki data psikolog. Mulai dengan menambahkan psikolog pertama."
              }
              action={
                searchQuery ? (
                  <Button variant="outline" onClick={() => setSearchQuery("")}>
                    Bersihkan pencarian
                  </Button>
                ) : (
                  <Button onClick={openAddSheet}>
                    <Plus className="size-4" />
                    Tambah Psikolog
                  </Button>
                )
              }
            />
          ) : (
            <DataTable>
              <TableHead>
                <TableRow>
                  <TableHeaderCell scope="col">Nama Lengkap</TableHeaderCell>
                  <TableHeaderCell scope="col">Email Akun</TableHeaderCell>
                  <TableHeaderCell scope="col">Bidang Keahlian</TableHeaderCell>
                  <TableHeaderCell scope="col">Biaya Konsultasi</TableHeaderCell>
                  <TableHeaderCell scope="col">Status</TableHeaderCell>
                  <TableHeaderCell scope="col" className="text-right">Aksi</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPsychologists.map((p) => (
                  <TableRow key={p.psychologist_id} interactive>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {p.photo_url ? (
                          <img
                            src={p.photo_url}
                            alt={p.full_name}
                            className="size-9 shrink-0 rounded-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <IconBoxAvatar />
                        )}
                        <span className="font-medium text-heading">{p.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.email ? (
                        <span className="break-all">{p.email}</span>
                      ) : (
                        <span className="text-muted-foreground/70">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.expertise}</TableCell>
                    <TableCell className="font-medium text-heading">
                      {formatRupiah(p.consultation_fee)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={p.is_active ? "success" : "neutral"}
                        label={p.is_active ? "Aktif" : "Nonaktif"}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Ubah psikolog ${p.full_name}`}
                          onClick={() => openEditSheet(p)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-danger hover:bg-danger-soft hover:text-danger"
                          aria-label={`Hapus psikolog ${p.full_name}`}
                          onClick={() => confirmDelete(p)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPsychologists.length === 0 ? (
                  <TableEmptyRow colSpan={6}>Belum ada psikolog.</TableEmptyRow>
                ) : null}
              </TableBody>
            </DataTable>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent side="right" className="gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="gap-1.5 border-b border-border/70 px-6 pt-6 pb-5">
            <SheetTitle>{editingPsychologist ? "Ubah Psikolog" : "Tambah Psikolog Baru"}</SheetTitle>
            <SheetDescription>
              {editingPsychologist
                ? "Perbarui informasi psikolog sekolah."
                : "Tambahkan psikolog baru yang dapat direkomendasikan kepada siswa."}
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col gap-6 px-6 pt-6 pb-8"
          >
            <div className="space-y-2">
              <Label htmlFor="full_name">Nama Lengkap</Label>
              <Input
                id="full_name"
                placeholder="cth. Dr. Jane Doe, M.Psi."
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">Wajib diisi.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Akun</Label>
              <Input
                id="email"
                type="email"
                placeholder="cth. psikolog@sekolah.sch.id"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                readOnly={Boolean(editingPsychologist)}
                required={!editingPsychologist}
              />
              <p className="text-xs text-muted-foreground">
                {editingPsychologist
                  ? "Email akun tidak dapat diubah dari sini."
                  : "Dipakai untuk masuk ke sistem. Wajib diisi."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Kata Sandi</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder={editingPsychologist ? "•••••••• (kosongkan bila tidak diubah)" : "Minimal 6 karakter"}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={Boolean(editingPsychologist)}
              />
              <p className="text-xs text-muted-foreground">
                {editingPsychologist
                  ? "Kata sandi hanya dapat diubah melalui Manajemen Pengguna."
                  : "Kosongkan untuk membuat kata sandi acak."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expertise">Bidang Keahlian</Label>
              <Input
                id="expertise"
                placeholder="cth. Anak &amp; Remaja, Gangguan Perilaku"
                value={formData.expertise}
                onChange={(e) => setFormData({ ...formData, expertise: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">Wajib diisi.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="consultation_fee">Biaya Konsultasi (IDR)</Label>
              <Input
                id="consultation_fee"
                type="number"
                min="0"
                step="1000"
                placeholder="cth. 500000"
                value={formData.consultation_fee}
                onChange={(e) => setFormData({ ...formData, consultation_fee: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                {formData.consultation_fee && !isNaN(Number(formData.consultation_fee))
                  ? `Terbaca sebagai ${formatRupiah(Number(formData.consultation_fee))}`
                  : "Wajib diisi dengan angka positif."}
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="photo_url">Foto Psikolog</Label>

              <label
                htmlFor="photo_url"
                className="flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-border bg-[#fbfcfe] px-6 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary-softer"
              >
                {formData.photo_url ? (
                  <img
                    src={formData.photo_url}
                    alt="Pratinjau foto psikolog"
                    className="size-20 rounded-full object-cover ring-2 ring-border"
                  />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-xl bg-[#eef3fb] text-muted-foreground">
                    <Upload className="size-5" />
                  </span>
                )}
                <span className="space-y-0.5">
                  <span className="block text-[0.8125rem] font-semibold text-heading">
                    Unggah foto
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    JPG atau PNG, maksimal 2 MB
                  </span>
                </span>
                <input
                  id="photo_url"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={handlePhotoChange}
                />
              </label>

              <div className="flex items-center gap-2">
                <Input
                  type="url"
                  placeholder="atau tempel tautan foto..."
                  value={formData.photo_url.startsWith("data:") ? "" : formData.photo_url}
                  onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })}
                />
                {formData.photo_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setFormData({ ...formData, photo_url: "" })}
                    aria-label="Hapus foto"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </div>

            <SheetFooter className="mt-2 flex-row justify-end gap-3 p-0">
              <Button type="button" variant="outline" onClick={closeSheet} disabled={isSubmitting}>
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Menyimpan…"
                  : editingPsychologist
                    ? "Simpan Perubahan"
                    : "Tambah Psikolog"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !open && setDeleteDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Psikolog</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus <strong>{psychologistToDelete?.full_name}</strong>?{" "}
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Batal
            </Button>
            <Button variant="destructive-solid" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Menghapus…" : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Neutral avatar placeholder for psychologists without a photo. */
function IconBoxAvatar() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <UserCircle className="size-5" />
    </span>
  );
}