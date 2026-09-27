"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserCircle, Plus, Pencil, Trash2, RefreshCw, Search, Eye, EyeOff } from "lucide-react";

interface SchoolPsychologist {
  psychologist_id: string;
  full_name: string;
  expertise: string;
  consultation_fee: number;
  photo_url: string | null;
  is_active: boolean;
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
        if (showToast) toast.success("Daftar psikolog diperbarui.");
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

  const openAddSheet = () => {
    setEditingPsychologist(null);
    setFormData({ full_name: "", expertise: "", consultation_fee: "", photo_url: "" });
    setSheetOpen(true);
  };

  const openEditSheet = (p: SchoolPsychologist) => {
    setEditingPsychologist(p);
    setFormData({
      full_name: p.full_name,
      expertise: p.expertise,
      consultation_fee: String(p.consultation_fee),
      photo_url: p.photo_url ?? "",
    });
    setSheetOpen(true);
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

    setIsSubmitting(true);
    try {
      const body = {
        full_name: formData.full_name.trim(),
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
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Kelola Psikolog Sekolah
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2">
          Tambah, edit, atau hapus psikolog yang dapat direkomendasikan kepada siswa.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <UserCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{psychologists.length}</p>
                <p className="text-xs text-muted-foreground">Total Psikolog</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Eye className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{psychologists.filter((p) => p.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Aktif</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <EyeOff className="h-5 w-5 text-zinc-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{psychologists.filter((p) => !p.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Nonaktif</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card className="glass shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              Daftar Psikolog
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => fetchPsychologists(true)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama atau keahlian..."
                className="pl-9 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button onClick={openAddSheet}>
              <Plus className="h-4 w-4 mr-2" />
              Tambah Psikolog
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-20">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary/50" />
              <p className="text-sm text-muted-foreground mt-2">Memuat...</p>
            </div>
          ) : filteredPsychologists.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground border border-dashed rounded-lg">
              {searchQuery ? "Tidak ada psikolog yang cocok dengan pencarian." : "Belum ada psikolog. Tambahkan psikolog pertama."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nama Lengkap</th>
                    <th className="px-4 py-3 font-medium">Bidang Keahlian</th>
                    <th className="px-4 py-3 font-medium">Biaya Konsultasi</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPsychologists.map((p) => (
                    <tr key={p.psychologist_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.photo_url ? (
                            <img
                              src={p.photo_url}
                              alt={p.full_name}
                              className="h-8 w-8 rounded-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <UserCircle className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="font-medium">{p.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.expertise}</td>
                      <td className="px-4 py-3 font-medium">{formatRupiah(p.consultation_fee)}</td>
                      <td className="px-4 py-3">
                        {p.is_active ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Aktif
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            Nonaktif
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEditSheet(p)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                            onClick={() => confirmDelete(p)}
                            title="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editingPsychologist ? "Edit Psikolog" : "Tambah Psikolog Baru"}</SheetTitle>
            <SheetDescription>
              {editingPsychologist
                ? "Perbarui informasi psikolog sekolah."
                : "Tambahkan psikolog baru yang dapat direkomendasikan kepada siswa."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="full_name">
                Nama Lengkap <span className="text-red-500">*</span>
              </Label>
              <Input
                id="full_name"
                placeholder="cth. Dr. Jane Doe, M.Psi."
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expertise">
                Bidang Keahlian <span className="text-red-500">*</span>
              </Label>
              <Input
                id="expertise"
                placeholder="cth. Anak & Remaja, Gangguan Perilaku"
                value={formData.expertise}
                onChange={(e) => setFormData({ ...formData, expertise: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="consultation_fee">
                Biaya Konsultasi (IDR) <span className="text-red-500">*</span>
              </Label>
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
              {formData.consultation_fee && !isNaN(Number(formData.consultation_fee)) && (
                <p className="text-xs text-muted-foreground">
                  = {formatRupiah(Number(formData.consultation_fee))}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="photo_url">URL Foto (Opsional)</Label>
              <Input
                id="photo_url"
                type="url"
                placeholder="https://example.com/photo.jpg"
                value={formData.photo_url}
                onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })}
              />
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={closeSheet} disabled={isSubmitting}>
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Menyimpan..." : editingPsychologist ? "Simpan Perubahan" : "Tambah Psikolog"}
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
              Apakah Anda yakin ingin menghapus <strong>{psychologistToDelete?.full_name}</strong>? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
