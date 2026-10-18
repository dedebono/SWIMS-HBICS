"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { IconBox, type IconTone } from "@/components/ui/icon-box";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/data-table";
import {
  BookOpen, Plus, Pencil, Trash2, RefreshCw, Save, ChevronDown, ChevronRight,
  Layers, Scale, GraduationCap, FileText, AlertTriangle, FolderOpen,
  ExternalLink, Download, Upload, Loader2, ListTree, TriangleAlert,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Category { id: number; name: string; general_description: string | null; characteristics: string | null; impact_victim: string | null; impact_perpetrator: string | null; impact_school: string | null; }
interface EducationLevel { id: number; code: string; name: string; sort_order: number; }
interface BehaviorGroup { id: number; category_id: number; group_name: string; description: string | null; }
interface BehaviorDetail { id: number; group_id: number; behavior_text: string; }
interface Level { id: number; code: string; name: string; sort_order: number; }
interface BehaviorWithLevels extends BehaviorDetail { levels: Level[]; }
interface BehaviorGroupWithBehaviors { group: BehaviorGroup; behaviors: BehaviorWithLevels[]; }
interface HandbookTreeNode { category: Category; groups: BehaviorGroupWithBehaviors[]; }
interface HandlingGuideline { id: number; category_id: number; level_id: number; target_type: string; step_number: number; guideline_text: string; }
interface ConsequenceGuideline { id: number; category_id: number; level_id: number; consequence_type: string; consequence_text: string; }
interface RequiredDocument { id: number; category_id: number; level_id: number; document_name: string; template_url: string | null; description: string | null; }

// ─── Constants ────────────────────────────────────────────────────────────────

/** Category accents: pastel tint + semantic tones (light mode only). */
const CATEGORY_STYLE: Record<number, { tone: IconTone; badge: StatusTone; surface: string; accent: string }> = {
  1: {
    tone: "green",
    badge: "success",
    surface: "bg-success-soft/40 border-success-soft",
    accent: "bg-success",
  },
  2: {
    tone: "yellow",
    badge: "warning",
    surface: "bg-warning-soft/40 border-warning-soft",
    accent: "bg-warning",
  },
  3: {
    tone: "teal",
    badge: "info",
    surface: "bg-info-soft/40 border-info-soft",
    accent: "bg-primary",
  },
  4: {
    tone: "red",
    badge: "danger",
    surface: "bg-danger-soft/40 border-danger-soft",
    accent: "bg-danger",
  },
};

const DEFAULT_CATEGORY_STYLE = {
  tone: "slate" as IconTone,
  badge: "neutral" as StatusTone,
  surface: "bg-muted border-border",
  accent: "bg-muted-foreground",
};

/** Consequence type → semantic badge tone. */
const CONSEQUENCE_TONE: Record<string, StatusTone> = {
  "Tugas Reflektif": "info",
  "Perbaikan Langsung": "success",
  "Pembatasan Sementara": "warning",
  "Konferensi Keluarga": "purple",
  "Skorsing": "warning",
  "Skorsing Ringan": "warning",
  "Skorsing Berat": "danger",
  "Ganti Rugi": "purple",
  "Tugas Karakter": "info",
  "Pelanggaran Surat Pernyataan": "purple",
  "Koordinasi Pihak Luar": "neutral",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryStyle(id: number) {
  return CATEGORY_STYLE[id] ?? DEFAULT_CATEGORY_STYLE;
}

/** Compact code chips for education levels. */
function LevelBadge({ levels }: { levels: Level[] }) {
  if (levels.length === 0) {
    return <span className="text-xs text-muted-foreground">Semua jenjang</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {levels.map((l) => (
        <StatusBadge key={l.id} tone="neutral" dot={false} label={l.code} />
      ))}
    </div>
  );
}

/** Small icon-button pair used for edit / delete row actions. */
function RowActions({
  editLabel,
  onEdit,
  deleteLabel,
  onDelete,
}: {
  /** Omit when the row has no edit affordance. */
  editLabel?: string;
  onEdit?: () => void;
  deleteLabel: string;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-1.5">
      {editLabel && onEdit ? (
        <Button variant="ghost" size="icon-sm" aria-label={editLabel} onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-danger hover:bg-danger-soft hover:text-danger"
        aria-label={deleteLabel}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/** Header row for a tab panel: helper text on the left, action button right. */
function PanelHeader({ hint, actionLabel, onAction }: { hint: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">{hint}</p>
      <Button size="sm" onClick={onAction} className="self-start sm:self-auto">
        <Plus className="size-4" />
        {actionLabel}
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminDisciplineHandbookPage() {
  const [loading, setLoading] = useState(true);

  // Data
  const [tree, setTree] = useState<HandbookTreeNode[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [levels, setLevels] = useState<EducationLevel[]>([]);
  const [guidelines, setGuidelines] = useState<HandlingGuideline[]>([]);
  const [consequences, setConsequences] = useState<ConsequenceGuideline[]>([]);
  const [documents, setDocuments] = useState<RequiredDocument[]>([]);

  // Dialog states
  const [dlg, setDlg] = useState<{ open: string; data?: any }>({ open: "" });
  const openDlg = (name: string, data?: any) => setDlg({ open: name, data });
  const closeDlg = () => setDlg({ open: "" });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t, c, l, g, cs, d] = await Promise.all([
        apiClient<HandbookTreeNode[]>("/discipline-handbook/tree"),
        apiClient<Category[]>("/discipline-handbook/categories"),
        apiClient<EducationLevel[]>("/discipline-handbook/levels"),
        apiClient<HandlingGuideline[]>("/discipline-handbook/guidelines"),
        apiClient<ConsequenceGuideline[]>("/discipline-handbook/consequences"),
        apiClient<RequiredDocument[]>("/discipline-handbook/documents"),
      ]);
      if (t.success) setTree(t.data ?? []);
      if (c.success) setCategories(c.data ?? []);
      if (l.success) setLevels(l.data ?? []);
      if (g.success) setGuidelines(g.data ?? []);
      if (cs.success) setConsequences(cs.data ?? []);
      if (d.success) setDocuments(d.data ?? []);
    } catch { toast.error("Gagal memuat data buku pedoman."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function doPost(endpoint: string, body: any, onSuccess?: () => void) {
    try {
      const res = await apiClient(endpoint, { method: "POST", body });
      if (res.success) { toast.success("Berhasil disimpan."); closeDlg(); fetchAll(); onSuccess?.(); }
      else toast.error(res.error || "Gagal menyimpan.");
    } catch { toast.error("Terjadi kesalahan saat menyimpan."); }
  }

  async function doPut(endpoint: string, body: any, onSuccess?: () => void) {
    try {
      const res = await apiClient(endpoint, { method: "PUT", body });
      if (res.success) { toast.success("Berhasil diperbarui."); closeDlg(); fetchAll(); onSuccess?.(); }
      else toast.error(res.error || "Gagal memperbarui.");
    } catch { toast.error("Terjadi kesalahan saat memperbarui."); }
  }

  async function doDelete(endpoint: string, id: number, label: string) {
    if (!confirm(`Hapus "${label}"?`)) return;
    try {
      const res = await apiClient(`${endpoint}/${id}`, { method: "DELETE" });
      if (res.success) { toast.success("Berhasil dihapus."); fetchAll(); }
      else toast.error(res.error || "Gagal menghapus.");
    } catch { toast.error("Terjadi kesalahan saat menghapus."); }
  }

  const catName = (id: number) => categories.find(c => c.id === id)?.name ?? `Kategori ${id}`;
  const levelCode = (id: number) => levels.find(l => l.id === id)?.code ?? "—";

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    try {
      const res = await apiClient<any>('/discipline-handbook/export');
      if (!res.success) { toast.error('Gagal mengekspor data.'); return; }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `buku-pedoman-disiplin-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Data berhasil diekspor.');
    } catch { toast.error('Gagal mengekspor data.'); }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(`Impor data dari "${file.name}"? Seluruh data buku pedoman saat ini akan diganti.`)) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await apiClient('/discipline-handbook/import', { method: 'POST', body: data });
      if (res.success) {
        toast.success('Data berhasil diimpor.');
        fetchAll();
      } else {
        toast.error(res.error || 'Gagal mengimpor data.');
      }
    } catch { toast.error('Berkas tidak valid.'); }
    e.target.value = '';
  }

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [catCollapsed, setCatCollapsed] = useState<Set<number>>(new Set());
  const toggle = (key: string) => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleCat = (id: number) => setCatCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totalGroups = tree.reduce((s, n) => s + n.groups.length, 0);
  const totalBehaviors = tree.reduce((s, n) => s + n.groups.reduce((x, g) => x + g.behaviors.length, 0), 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Buku Pedoman Disiplin"
          description="Kelola kategori, jenjang, SOP penanganan, sanksi, dan dokumen."
        />
        <div className="flex h-64 items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buku Pedoman Disiplin"
        description="Kelola kategori, jenjang, SOP penanganan, sanksi, dan dokumen."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={fetchAll}>
              <RefreshCw className="size-4" />
              Muat Ulang
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4" />
              Ekspor
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" />
              Impor
            </Button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          </>
        }
      />

      {/* ── Ringkasan ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Kategori Pelanggaran"
          value={categories.length}
          hint="Empat tingkatan pelanggaran"
          icon={<Scale className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Kelompok Perilaku"
          value={totalGroups}
          hint="Grup perilaku di seluruh kategori"
          icon={<ListTree className="size-5" />}
          iconTone="purple"
        />
        <StatCard
          label="Butir Perilaku"
          value={totalBehaviors}
          hint="Detail perilaku yang tercatat"
          icon={<FileText className="size-5" />}
          iconTone="teal"
        />
        <StatCard
          label="Jenjang Pendidikan"
          value={levels.length}
          hint={`${guidelines.length} SOP · ${consequences.length} sanksi · ${documents.length} dokumen`}
          icon={<GraduationCap className="size-5" />}
          iconTone="green"
        />
      </div>

      {/* ── Tabs ── */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <IconBox tone="blue">
              <BookOpen />
            </IconBox>
            <div className="space-y-1">
              <CardTitle>Isi Buku Pedoman</CardTitle>
              <CardDescription>
                Pilih bagian yang ingin Anda kelola: struktur, kategori, jenjang, SOP, sanksi, atau dokumen.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="structure">
            <TabsList>
              <TabsTrigger value="structure">
                <Layers />
                Struktur
              </TabsTrigger>
              <TabsTrigger value="categories">
                <Scale />
                Kategori
              </TabsTrigger>
              <TabsTrigger value="levels">
                <GraduationCap />
                Jenjang
              </TabsTrigger>
              <TabsTrigger value="guidelines">
                <FileText />
                SOP
              </TabsTrigger>
              <TabsTrigger value="consequences">
                <AlertTriangle />
                Sanksi
              </TabsTrigger>
              <TabsTrigger value="documents">
                <FolderOpen />
                Dokumen
              </TabsTrigger>
            </TabsList>

            {/* ══════════════ STRUKTUR ══════════════ */}
            <TabsContent value="structure" className="space-y-4">
              <PanelHeader
                hint="Hierarki kategori → kelompok → butir perilaku."
                actionLabel="Tambah Kelompok"
                onAction={() => openDlg("add-group")}
              />

              {tree.length === 0 ? (
                <EmptyState
                  icon={<Layers />}
                  title="Belum ada struktur"
                  description="Tambahkan kategori dan jenjang terlebih dahulu, lalu susun kelompok serta butir perilaku."
                  action={
                    <Button onClick={() => openDlg("add-category")}>
                      <Plus className="size-4" />
                      Tambah Kategori
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openDlg("add-behavior")}>
                      <Plus className="size-4" />
                      Tambah Perilaku
                    </Button>
                  </div>
                  {tree.map((node) => {
                    const style = categoryStyle(node.category.id);
                    const totalBehaviorsInCat = node.groups.reduce((s, g) => s + g.behaviors.length, 0);
                    return (
                      <div key={node.category.id} className={`overflow-hidden rounded-xl border ${style.surface}`}>
                        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            onClick={() => toggleCat(node.category.id)}
                          >
                            {catCollapsed.has(node.category.id) ? (
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className={`size-2.5 shrink-0 rounded-full ${style.accent}`} />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-heading">
                                {node.category.name}
                              </span>
                              {node.category.general_description ? (
                                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                                  {node.category.general_description}
                                </span>
                              ) : null}
                            </span>
                          </button>
                          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                            <StatusBadge tone={style.badge} dot={false} label={`${node.groups.length} kelompok`} />
                            <StatusBadge tone="neutral" dot={false} label={`${totalBehaviorsInCat} perilaku`} />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Ubah kategori ${node.category.name}`}
                              onClick={() => openDlg("edit-category", node.category)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          </div>
                        </div>

                        {!catCollapsed.has(node.category.id) ? (
                          <div className="space-y-2 border-t border-border/60 px-4 py-3">
                            {node.groups.map((grp) => {
                              const grpKey = `${node.category.id}-grp-${grp.group.id}`;
                              return (
                                <div key={grpKey} className="overflow-hidden rounded-xl border border-border bg-card">
                                  <div className="flex items-center justify-between gap-3 bg-muted/60 px-4 py-2.5">
                                    <button
                                      type="button"
                                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                                      onClick={() => toggle(grpKey)}
                                    >
                                      {expanded.has(grpKey) ? (
                                        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                                      )}
                                      <span className="truncate text-sm font-medium text-heading">
                                        {grp.group.group_name}
                                      </span>
                                      <StatusBadge
                                        tone="neutral"
                                        dot={false}
                                        label={`${grp.behaviors.length} butir`}
                                      />
                                    </button>
                                    <RowActions
                                      deleteLabel={`Hapus kelompok ${grp.group.group_name}`}
                                      onDelete={() => {
                                        const msg = grp.behaviors.length > 0
                                          ? `Hapus kelompok "${grp.group.group_name}" beserta ${grp.behaviors.length} perilaku di dalamnya?`
                                          : `Hapus kelompok "${grp.group.group_name}"?`;
                                        if (confirm(msg)) doDelete("/discipline-handbook/groups", grp.group.id, grp.group.group_name);
                                      }}
                                    />
                                  </div>

                                  {expanded.has(grpKey) ? (
                                    <div className="border-t border-border">
                                      {grp.behaviors.length === 0 ? (
                                        <p className="px-4 py-3 text-sm text-muted-foreground">
                                          Belum ada butir perilaku pada kelompok ini.
                                        </p>
                                      ) : (
                                        grp.behaviors.map((b) => (
                                          <div
                                            key={b.id}
                                            className="flex flex-col gap-3 border-b border-border px-4 py-3 text-sm last:border-0 lg:flex-row lg:items-start"
                                          >
                                            <p className="flex-1 leading-relaxed text-secondary-text">
                                              {b.behavior_text}
                                            </p>
                                            <div className="shrink-0">
                                              <LevelBadge levels={b.levels} />
                                            </div>
                                            <RowActions
                                              editLabel={`Ubah perilaku ${b.behavior_text.slice(0, 40)}`}
                                              onEdit={() =>
                                                openDlg("edit-behavior", { ...b, group_name: grp.group.group_name })
                                              }
                                              deleteLabel={`Hapus perilaku ${b.behavior_text.slice(0, 40)}`}
                                              onDelete={() =>
                                                doDelete("/discipline-handbook/behaviors", b.id, b.behavior_text.slice(0, 30))
                                              }
                                            />
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                            {node.groups.length === 0 ? (
                              <p className="py-2 text-xs text-muted-foreground">
                                Belum ada kelompok perilaku pada kategori ini.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ══════════════ KATEGORI ══════════════ */}
            <TabsContent value="categories" className="space-y-4">
              <PanelHeader
                hint="Empat tingkatan pelanggaran: ringan, sedang, berat, dan sangat berat."
                actionLabel="Tambah Kategori"
                onAction={() => openDlg("add-category")}
              />

              {categories.length === 0 ? (
                <EmptyState
                  icon={<Scale />}
                  title="Belum ada kategori"
                  description="Buat kategori pelanggaran terlebih dahulu agar SOP dan sanksi dapat ditautkan."
                  action={
                    <Button onClick={() => openDlg("add-category")}>
                      <Plus className="size-4" />
                      Tambah Kategori
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {categories.map((c) => {
                    const style = categoryStyle(c.id);
                    const node = tree.find(n => n.category.id === c.id);
                    const groupCount = node?.groups.length ?? 0;
                    const behaviorCount = node?.groups.reduce((s, g) => s + g.behaviors.length, 0) ?? 0;
                    return (
                      <div key={c.id} className={`flex flex-col rounded-xl border p-4 ${style.surface}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`size-2.5 shrink-0 rounded-full ${style.accent}`} />
                              <span className="text-sm font-semibold text-heading">{c.name}</span>
                              <StatusBadge tone="neutral" dot={false} label={`#${c.id}`} />
                            </div>
                            {c.general_description ? (
                              <p className="text-xs leading-relaxed text-secondary-text">
                                {c.general_description}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge tone={style.badge} dot={false} label={`${groupCount} kelompok`} />
                              <StatusBadge tone="neutral" dot={false} label={`${behaviorCount} perilaku`} />
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Ubah kategori ${c.name}`}
                              onClick={() => openDlg("edit-category", c)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-danger hover:bg-danger-soft hover:text-danger"
                              aria-label={`Hapus kategori ${c.name}`}
                              onClick={() => {
                                const msg = groupCount > 0
                                  ? `Hapus "${c.name}" beserta ${groupCount} kelompok dan semua data terkait?`
                                  : `Hapus "${c.name}"?`;
                                if (confirm(msg)) doDelete("/discipline-handbook/categories", c.id, c.name);
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>

                        {(c.characteristics || c.impact_victim || c.impact_perpetrator || c.impact_school) ? (
                          <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                            {c.characteristics ? (
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                <span className="font-semibold text-secondary-text">Ciri-ciri: </span>
                                {c.characteristics}
                              </p>
                            ) : null}
                            {c.impact_victim ? (
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                <span className="font-semibold text-secondary-text">Dampak bagi korban: </span>
                                {c.impact_victim}
                              </p>
                            ) : null}
                            {c.impact_perpetrator ? (
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                <span className="font-semibold text-secondary-text">Dampak bagi pelaku: </span>
                                {c.impact_perpetrator}
                              </p>
                            ) : null}
                            {c.impact_school ? (
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                <span className="font-semibold text-secondary-text">Dampak bagi sekolah: </span>
                                {c.impact_school}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ══════════════ JENJANG ══════════════ */}
            <TabsContent value="levels" className="space-y-4">
              <PanelHeader
                hint="Jenjang pendidikan yang berlaku untuk SOP dan sanksi."
                actionLabel="Tambah Jenjang"
                onAction={() => openDlg("add-level")}
              />

              {levels.length === 0 ? (
                <EmptyState
                  icon={<GraduationCap />}
                  title="Belum ada jenjang"
                  description="Tambahkan jenjang pendidikan seperti TK, SD, SMP, atau SMA agar SOP dapat diterapkan per jenjang."
                  action={
                    <Button onClick={() => openDlg("add-level")}>
                      <Plus className="size-4" />
                      Tambah Jenjang
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[...levels].sort((a, b) => a.sort_order - b.sort_order).map((l) => (
                    <div
                      key={l.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
                    >
                      <div className="min-w-0">
                        <span className="font-heading text-2xl font-bold text-primary">{l.code}</span>
                        <p className="mt-0.5 text-sm text-heading">{l.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Urutan tampil: {l.sort_order}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Ubah jenjang ${l.name}`}
                          onClick={() => openDlg("edit-level", l)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-danger hover:bg-danger-soft hover:text-danger"
                          aria-label={`Hapus jenjang ${l.name}`}
                          onClick={() => {
                            const gCount = guidelines.filter(g => g.level_id === l.id).length;
                            const cCount = consequences.filter(c => c.level_id === l.id).length;
                            const dCount = documents.filter(d => d.level_id === l.id).length;
                            const total = gCount + cCount + dCount;
                            const msg = total > 0
                              ? `Hapus "${l.name}"? Jenjang ini dipakai pada ${total} data (SOP: ${gCount}, Sanksi: ${cCount}, Dokumen: ${dCount}).`
                              : `Hapus "${l.name}"?`;
                            if (confirm(msg)) doDelete("/discipline-handbook/levels", l.id, l.name);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ══════════════ SOP ══════════════ */}
            <TabsContent value="guidelines" className="space-y-4">
              <PanelHeader
                hint="Panduan penanganan per kategori, jenjang, dan tahap."
                actionLabel="Tambah SOP"
                onAction={() => openDlg("add-guideline")}
              />

              {guidelines.length === 0 ? (
                <EmptyState
                  icon={<FileText />}
                  title="Belum ada SOP"
                  description="Tambahkan langkah-langkah penanganan untuk setiap kategori dan jenjang."
                  action={
                    <Button onClick={() => openDlg("add-guideline")}>
                      <Plus className="size-4" />
                      Tambah SOP
                    </Button>
                  }
                />
              ) : (
                <DataTable>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell scope="col" className="w-12">No</TableHeaderCell>
                      <TableHeaderCell scope="col">Kategori</TableHeaderCell>
                      <TableHeaderCell scope="col">Jenjang</TableHeaderCell>
                      <TableHeaderCell scope="col">Tahap</TableHeaderCell>
                      <TableHeaderCell scope="col" className="w-20 text-center">Langkah</TableHeaderCell>
                      <TableHeaderCell scope="col">Isi SOP</TableHeaderCell>
                      <TableHeaderCell scope="col" className="w-20 text-right">Aksi</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {guidelines.map((g, i) => (
                      <TableRow key={g.id} interactive>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium text-heading">{catName(g.category_id)}</TableCell>
                        <TableCell>
                          <StatusBadge tone="neutral" dot={false} label={levelCode(g.level_id)} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone="info" label={g.target_type} />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge tone="purple" dot={false} label={String(g.step_number)} />
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="line-clamp-2 leading-relaxed">{g.guideline_text}</p>
                        </TableCell>
                        <TableCell>
                          <RowActions
                            editLabel={`Ubah SOP langkah ${g.step_number} kategori ${catName(g.category_id)}`}
                            onEdit={() => openDlg("edit-guideline", g)}
                            deleteLabel={`Hapus SOP langkah ${g.step_number} kategori ${catName(g.category_id)}`}
                            onDelete={() => doDelete("/discipline-handbook/guidelines", g.id, `SOP #${g.id}`)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}
            </TabsContent>

            {/* ══════════════ SANKSI ══════════════ */}
            <TabsContent value="consequences" className="space-y-4">
              <PanelHeader
                hint="Jenis sanksi dan detail konsekuensi per kategori dan jenjang."
                actionLabel="Tambah Sanksi"
                onAction={() => openDlg("add-consequence")}
              />

              {consequences.length === 0 ? (
                <EmptyState
                  icon={<TriangleAlert />}
                  title="Belum ada sanksi"
                  description="Tambahkan jenis sanksi beserta detail konsekuensinya untuk setiap kategori dan jenjang."
                  action={
                    <Button onClick={() => openDlg("add-consequence")}>
                      <Plus className="size-4" />
                      Tambah Sanksi
                    </Button>
                  }
                />
              ) : (
                <DataTable>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell scope="col" className="w-12">No</TableHeaderCell>
                      <TableHeaderCell scope="col">Kategori</TableHeaderCell>
                      <TableHeaderCell scope="col">Jenjang</TableHeaderCell>
                      <TableHeaderCell scope="col">Jenis Sanksi</TableHeaderCell>
                      <TableHeaderCell scope="col">Detail Sanksi</TableHeaderCell>
                      <TableHeaderCell scope="col" className="w-20 text-right">Aksi</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {consequences.map((c, i) => (
                      <TableRow key={c.id} interactive>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium text-heading">{catName(c.category_id)}</TableCell>
                        <TableCell>
                          <StatusBadge tone="neutral" dot={false} label={levelCode(c.level_id)} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={CONSEQUENCE_TONE[c.consequence_type] ?? "neutral"}
                            label={c.consequence_type}
                          />
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="line-clamp-2 leading-relaxed">{c.consequence_text}</p>
                        </TableCell>
                        <TableCell>
                          <RowActions
                            editLabel={`Ubah sanksi ${c.consequence_type} kategori ${catName(c.category_id)}`}
                            onEdit={() => openDlg("edit-consequence", c)}
                            deleteLabel={`Hapus sanksi ${c.consequence_type} kategori ${catName(c.category_id)}`}
                            onDelete={() => doDelete("/discipline-handbook/consequences", c.id, `Sanksi #${c.id}`)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}
            </TabsContent>

            {/* ══════════════ DOKUMEN ══════════════ */}
            <TabsContent value="documents" className="space-y-4">
              <PanelHeader
                hint="Dokumen administrasi yang diperlukan per kategori dan jenjang."
                actionLabel="Tambah Dokumen"
                onAction={() => openDlg("add-document")}
              />

              {documents.length === 0 ? (
                <EmptyState
                  icon={<FolderOpen />}
                  title="Belum ada dokumen"
                  description="Tambahkan dokumen administrasi beserta tautan template yang dibutuhkan pada setiap kategori."
                  action={
                    <Button onClick={() => openDlg("add-document")}>
                      <Plus className="size-4" />
                      Tambah Dokumen
                    </Button>
                  }
                />
              ) : (
                <DataTable>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell scope="col" className="w-12">No</TableHeaderCell>
                      <TableHeaderCell scope="col">Nama Dokumen</TableHeaderCell>
                      <TableHeaderCell scope="col">Kategori</TableHeaderCell>
                      <TableHeaderCell scope="col">Jenjang</TableHeaderCell>
                      <TableHeaderCell scope="col">Template</TableHeaderCell>
                      <TableHeaderCell scope="col">Keterangan</TableHeaderCell>
                      <TableHeaderCell scope="col" className="w-20 text-right">Aksi</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {documents.map((d, i) => (
                      <TableRow key={d.id} interactive>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium text-heading">{d.document_name}</TableCell>
                        <TableCell className="text-secondary-text">{catName(d.category_id)}</TableCell>
                        <TableCell>
                          <StatusBadge tone="neutral" dot={false} label={levelCode(d.level_id)} />
                        </TableCell>
                        <TableCell>
                          {d.template_url ? (
                            <a
                              href={d.template_url}
                              target="_blank"
                              rel="noreferrer"
                              className="action-link max-w-[160px] truncate"
                            >
                              <ExternalLink className="size-3.5" />
                              {d.template_url.split("/").pop()}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {d.description ? (
                            <p className="line-clamp-2 leading-relaxed">{d.description}</p>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <RowActions
                            editLabel={`Ubah dokumen ${d.document_name}`}
                            onEdit={() => openDlg("edit-document", d)}
                            deleteLabel={`Hapus dokumen ${d.document_name}`}
                            onDelete={() => doDelete("/discipline-handbook/documents", d.id, d.document_name)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Dialogs ── */}
      <Dialog open={dlg.open === "add-category" || dlg.open === "edit-category"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? "Ubah Kategori" : "Tambah Kategori"}</DialogTitle>
            <DialogDescription>Empat tingkatan: ringan, sedang, berat, dan sangat berat.</DialogDescription>
          </DialogHeader>
          <FormCategory data={dlg.data} onSubmit={(body) => {
            if (dlg.data?.id) doPut(`/discipline-handbook/categories/${dlg.data.id}`, body);
            else doPost("/discipline-handbook/categories", body);
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-level" || dlg.open === "edit-level"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? "Ubah Jenjang" : "Tambah Jenjang"}</DialogTitle>
            <DialogDescription>Tentukan jenjang pendidikan beserta urutan tampilnya.</DialogDescription>
          </DialogHeader>
          <FormLevel data={dlg.data} onSubmit={(body) => {
            if (dlg.data?.id) doPut(`/discipline-handbook/levels/${dlg.data.id}`, body);
            else doPost("/discipline-handbook/levels", body);
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-group"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Kelompok Perilaku</DialogTitle>
            <DialogDescription>Kelompokkan butir perilaku di bawah satu kategori.</DialogDescription>
          </DialogHeader>
          <FormGroup categories={categories} onSubmit={(body) => doPost("/discipline-handbook/groups", body)} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-behavior" || dlg.open === "edit-behavior"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? "Ubah Perilaku" : "Tambah Perilaku Spesifik"}</DialogTitle>
            <DialogDescription>Pilih kelompok perilaku dan jenjang yang berlaku.</DialogDescription>
          </DialogHeader>
          <FormBehavior data={dlg.data} categories={categories} groups={tree.flatMap(n => n.groups.map(g => g.group))} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) {
              doPost("/discipline-handbook/behaviors", { ...body, id: dlg.data.id }, () => doPut(`/discipline-handbook/behaviors/${dlg.data.id}/levels`, { level_ids: body.level_ids }));
            } else {
              doPost("/discipline-handbook/behaviors", { group_id: body.group_id, behavior_text: body.behavior_text, level_ids: body.level_ids });
            }
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-guideline" || dlg.open === "edit-guideline"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? "Ubah SOP" : "Tambah SOP"}</DialogTitle>
            <DialogDescription>Tuliskan langkah penanganan sesuai kategori, jenjang, dan tahap.</DialogDescription>
          </DialogHeader>
          <FormGuideline data={dlg.data} categories={categories} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) doPut(`/discipline-handbook/guidelines/${dlg.data.id}`, body);
            else doPost("/discipline-handbook/guidelines", body);
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-consequence" || dlg.open === "edit-consequence"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? "Ubah Sanksi" : "Tambah Sanksi"}</DialogTitle>
            <DialogDescription>Pilih jenis sanksi lalu jelaskan detail konsekuensinya.</DialogDescription>
          </DialogHeader>
          <FormConsequence data={dlg.data} categories={categories} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) doPut(`/discipline-handbook/consequences/${dlg.data.id}`, body);
            else doPost("/discipline-handbook/consequences", body);
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-document" || dlg.open === "edit-document"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? "Ubah Dokumen" : "Tambah Dokumen"}</DialogTitle>
            <DialogDescription>Tambahkan dokumen administrasi beserta tautan template bila tersedia.</DialogDescription>
          </DialogHeader>
          <FormDocument data={dlg.data} categories={categories} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) doPut(`/discipline-handbook/documents/${dlg.data.id}`, body);
            else doPost("/discipline-handbook/documents", body);
          }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FORM SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function FormFooter({ saving, label }: { saving: boolean; label?: string }) {
  return (
    <DialogFooter>
      <Button type="submit" disabled={saving}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {saving ? "Menyimpan…" : (label ?? "Simpan")}
      </Button>
    </DialogFooter>
  );
}

function FormCategory({ data, onSubmit }: { data?: Category; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ name: data?.name ?? "", general_description: data?.general_description ?? "", characteristics: data?.characteristics ?? "", impact_victim: data?.impact_victim ?? "", impact_perpetrator: data?.impact_perpetrator ?? "", impact_school: data?.impact_school ?? "" });
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaving(true); onSubmit(f); setSaving(false); }} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cat-name">Nama Kategori</Label>
        <Input id="cat-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required placeholder="Contoh: Pelanggaran Ringan" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cat-desc">Deskripsi Umum</Label>
        <Textarea id="cat-desc" rows={2} value={f.general_description} onChange={e => setF({ ...f, general_description: e.target.value })} placeholder="Ciri-ciri utama kategori" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cat-char">Ciri-ciri</Label>
        <Textarea id="cat-char" rows={3} value={f.characteristics} onChange={e => setF({ ...f, characteristics: e.target.value })} placeholder="Sifat atau karakteristik perilaku yang termasuk dalam kategori ini" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cat-victim">Dampak bagi Korban</Label>
        <Textarea id="cat-victim" rows={2} value={f.impact_victim} onChange={e => setF({ ...f, impact_victim: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cat-perp">Dampak bagi Pelaku</Label>
        <Textarea id="cat-perp" rows={2} value={f.impact_perpetrator} onChange={e => setF({ ...f, impact_perpetrator: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cat-school">Dampak bagi Sekolah</Label>
        <Textarea id="cat-school" rows={2} value={f.impact_school} onChange={e => setF({ ...f, impact_school: e.target.value })} />
      </div>
      <FormFooter saving={saving} />
    </form>
  );
}

function FormLevel({ data, onSubmit }: { data?: EducationLevel; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ code: data?.code ?? "", name: data?.name ?? "", sort_order: data?.sort_order ?? 0 });
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaving(true); onSubmit(f); setSaving(false); }} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="level-code">Kode</Label>
        <Input id="level-code" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} required placeholder="TK / SD / SMP / SMA" maxLength={10} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="level-name">Nama Lengkap</Label>
        <Input id="level-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required placeholder="Taman Kanak-Kanak / Sekolah Dasar" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="level-order">Urutan Tampilan</Label>
        <Input id="level-order" type="number" value={f.sort_order} onChange={e => setF({ ...f, sort_order: Number(e.target.value) })} />
      </div>
      <FormFooter saving={saving} />
    </form>
  );
}

function FormGroup({ categories, onSubmit }: { categories: Category[]; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category_id: "", group_name: "", description: "" });
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.category_id) { toast.error("Pilih kategori terlebih dahulu."); return; } setSaving(true); onSubmit({ ...f, category_id: Number(f.category_id) }); setSaving(false); }} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="group-category">Kategori</Label>
        <Select value={f.category_id} onValueChange={v => setF({ ...f, category_id: v ?? "" })}>
          <SelectTrigger id="group-category" className="w-full">
            <SelectValue placeholder="Pilih kategori" />
          </SelectTrigger>
          <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="group-name">Nama Kelompok</Label>
        <Input id="group-name" value={f.group_name} onChange={e => setF({ ...f, group_name: e.target.value })} required placeholder="Contoh: Kekerasan Fisik Berbahaya" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="group-desc">Deskripsi</Label>
        <Textarea id="group-desc" rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
      </div>
      <FormFooter saving={saving} />
    </form>
  );
}

function FormBehavior({ data, categories, groups, levels, onSubmit }: { data?: any; categories: Category[]; groups: BehaviorGroup[]; levels: EducationLevel[]; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category_id: data ? String(groups.find(g => g.id === data.group_id)?.category_id ?? "") : "", group_id: data ? String(data.group_id) : "", behavior_text: data?.behavior_text ?? "", level_ids: (data?.levels?.map((l: Level) => l.id) ?? []) as number[] });
  const [saving, setSaving] = useState(false);
  const filteredGroups = f.category_id ? groups.filter(g => g.category_id === Number(f.category_id)) : groups;
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.group_id) { toast.error("Pilih kelompok perilaku terlebih dahulu."); return; }
    setSaving(true);
    onSubmit({ group_id: Number(f.group_id), behavior_text: f.behavior_text, level_ids: f.level_ids });
    setSaving(false);
  };
  const toggleLevel = (id: number) => setF(prev => ({ ...prev, level_ids: prev.level_ids.includes(id) ? prev.level_ids.filter(l => l !== id) : [...prev.level_ids, id] }));
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="behavior-category">Kategori</Label>
        <Select value={f.category_id} onValueChange={v => setF({ ...f, category_id: v ?? "", group_id: "" })}>
          <SelectTrigger id="behavior-category" className="w-full">
            <SelectValue placeholder="Pilih kategori" />
          </SelectTrigger>
          <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="behavior-group">Kelompok Perilaku</Label>
        <Select value={f.group_id} onValueChange={v => setF({ ...f, group_id: v ?? "" })}>
          <SelectTrigger id="behavior-group" className="w-full">
            <SelectValue placeholder="Pilih kelompok" />
          </SelectTrigger>
          <SelectContent>{filteredGroups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.group_name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="behavior-text">Butir Perilaku</Label>
        <Textarea id="behavior-text" rows={3} value={f.behavior_text} onChange={e => setF({ ...f, behavior_text: e.target.value })} required placeholder="Contoh: Mencekik leher seseorang dengan sengaja." />
      </div>
      <div className="space-y-2">
        <Label>Berlaku untuk Jenjang</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {levels.map(l => (
            <button key={l.id} type="button" onClick={() => toggleLevel(l.id)}
              aria-pressed={f.level_ids.includes(l.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                f.level_ids.includes(l.id)
                  ? "border-primary-strong bg-primary-strong text-primary-foreground"
                  : "border-border bg-muted text-secondary-text hover:bg-accent"
              }`}>
              {l.code}
            </button>
          ))}
        </div>
        {f.level_ids.length === 0 ? (
          <p className="text-xs text-warning">Pilih minimal satu jenjang.</p>
        ) : null}
      </div>
      <FormFooter saving={saving} />
    </form>
  );
}

function FormGuideline({ data, categories, levels, onSubmit }: { data?: HandlingGuideline; categories: Category[]; levels: EducationLevel[]; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category_id: data ? String(data.category_id) : "", level_id: data ? String(data.level_id) : "", target_type: data?.target_type ?? "A. Identifikasi dan Klasifikasi", step_number: data?.step_number ?? 1, guideline_text: data?.guideline_text ?? "" });
  const [saving, setSaving] = useState(false);
  const TARGET_TYPES = ["A. Identifikasi dan Klasifikasi", "B. Penanganan Terlapor", "C. Penanganan Korban", "D. Penanganan Lingkungan", "E. Penyusunan Kesimpulan"];
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaving(true); onSubmit({ ...f, category_id: Number(f.category_id), level_id: Number(f.level_id), step_number: Number(f.step_number) }); setSaving(false); }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="sop-category">Kategori</Label>
          <Select value={f.category_id} onValueChange={v => setF({ ...f, category_id: v ?? "" })}>
            <SelectTrigger id="sop-category" className="w-full">
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sop-level">Jenjang</Label>
          <Select value={f.level_id} onValueChange={v => setF({ ...f, level_id: v ?? "" })}>
            <SelectTrigger id="sop-level" className="w-full">
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>{levels.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.code} — {l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sop-step">Nomor Langkah</Label>
          <Input id="sop-step" type="number" min={1} value={f.step_number} onChange={e => setF({ ...f, step_number: Number(e.target.value) })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sop-target">Tahap</Label>
        <Select value={f.target_type} onValueChange={v => setF({ ...f, target_type: v ?? "A. Identifikasi dan Klasifikasi" })}>
          <SelectTrigger id="sop-target" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{TARGET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sop-text">Isi Langkah</Label>
        <Textarea id="sop-text" rows={4} value={f.guideline_text} onChange={e => setF({ ...f, guideline_text: e.target.value })} required placeholder="Detail langkah penanganan…" />
      </div>
      <FormFooter saving={saving} />
    </form>
  );
}

function FormConsequence({ data, categories, levels, onSubmit }: { data?: ConsequenceGuideline; categories: Category[]; levels: EducationLevel[]; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category_id: data ? String(data.category_id) : "", level_id: data ? String(data.level_id) : "", consequence_type: data?.consequence_type ?? "", consequence_text: data?.consequence_text ?? "" });
  const [saving, setSaving] = useState(false);
  const CONSEQUENCE_TYPES = ["Tugas Reflektif", "Perbaikan Langsung", "Pembatasan Sementara", "Konferensi Keluarga", "Skorsing", "Skorsing Ringan", "Skorsing Berat", "Ganti Rugi", "Tugas Karakter", "Pelanggaran Surat Pernyataan", "Koordinasi Pihak Luar"];
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaving(true); onSubmit({ ...f, category_id: Number(f.category_id), level_id: Number(f.level_id) }); setSaving(false); }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sank-category">Kategori</Label>
          <Select value={f.category_id} onValueChange={v => setF({ ...f, category_id: v ?? "" })}>
            <SelectTrigger id="sank-category" className="w-full">
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sank-level">Jenjang</Label>
          <Select value={f.level_id} onValueChange={v => setF({ ...f, level_id: v ?? "" })}>
            <SelectTrigger id="sank-level" className="w-full">
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>{levels.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.code} — {l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sank-type">Jenis Sanksi</Label>
        <Select value={f.consequence_type} onValueChange={v => setF({ ...f, consequence_type: v ?? "" })}>
          <SelectTrigger id="sank-type" className="w-full">
            <SelectValue placeholder="Pilih jenis sanksi" />
          </SelectTrigger>
          <SelectContent>{CONSEQUENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sank-text">Detail Sanksi</Label>
        <Textarea id="sank-text" rows={4} value={f.consequence_text} onChange={e => setF({ ...f, consequence_text: e.target.value })} required placeholder="Contoh: SD: Menulis surat permintaan maaf. SMA: Membuat esai refleksi 500 kata." />
      </div>
      <FormFooter saving={saving} />
    </form>
  );
}

function FormDocument({ data, categories, levels, onSubmit }: { data?: RequiredDocument; categories: Category[]; levels: EducationLevel[]; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category_id: data ? String(data.category_id) : "", level_id: data ? String(data.level_id) : "", document_name: data?.document_name ?? "", template_url: data?.template_url ?? "", description: data?.description ?? "" });
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaving(true); onSubmit({ ...f, category_id: Number(f.category_id), level_id: Number(f.level_id) }); setSaving(false); }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="doc-category">Kategori</Label>
          <Select value={f.category_id} onValueChange={v => setF({ ...f, category_id: v ?? "" })}>
            <SelectTrigger id="doc-category" className="w-full">
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="doc-level">Jenjang</Label>
          <Select value={f.level_id} onValueChange={v => setF({ ...f, level_id: v ?? "" })}>
            <SelectTrigger id="doc-level" className="w-full">
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>{levels.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.code} — {l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="doc-name">Nama Dokumen</Label>
        <Input id="doc-name" value={f.document_name} onChange={e => setF({ ...f, document_name: e.target.value })} required placeholder="Surat Pernyataan Menerima Konsekuensi" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="doc-url">Tautan Template</Label>
        <Input id="doc-url" value={f.template_url} onChange={e => setF({ ...f, template_url: e.target.value })} placeholder="/templates/disiplin/surat-pernyataan.docx" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="doc-desc">Deskripsi</Label>
        <Textarea id="doc-desc" rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
      </div>
      <FormFooter saving={saving} />
    </form>
  );
}