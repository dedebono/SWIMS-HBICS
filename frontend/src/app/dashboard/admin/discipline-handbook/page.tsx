"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Plus, Pencil, Trash2, RefreshCw, Save, ChevronDown, ChevronRight,
  FileText, Scale, GraduationCap, Layers, AlertTriangle
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Category { id: number; name: string; general_description: string | null; impact_victim: string | null; impact_perpetrator: string | null; impact_school: string | null; }
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function CategoryCard({ cat, groupCount, onEdit, onDelete }: { cat: Category; groupCount: number; onEdit: (c: Category) => void; onDelete: (c: Category) => void }) {
  const colorMap: Record<number, string> = { 1: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", 2: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", 3: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", 4: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" };
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{cat.name}</span>
          <Badge className={colorMap[cat.id] ?? "bg-gray-100"}>{cat.id}</Badge>
          {groupCount > 0 && <Badge variant="secondary" className="text-[10px]">{groupCount} kelompok</Badge>}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onEdit(cat)}><Pencil className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => onDelete(cat)}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
      {cat.general_description && <p className="text-xs text-muted-foreground">{cat.general_description}</p>}
    </div>
  );
}

function LevelBadge({ levels }: { levels: Level[] }) {
  return <div className="flex gap-1 flex-wrap">{levels.map(l => <Badge key={l.id} variant="outline" className="text-[10px]">{l.code}</Badge>)}</div>;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminDisciplineHandbookPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tree");

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
    } catch {
      toast.error("Gagal memuat data buku pedoman");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── POST helper
  async function doPost(endpoint: string, body: any, onSuccess?: () => void) {
    try {
      const res = await apiClient(endpoint, { method: "POST", body });
      if (res.success) {
        toast.success("Berhasil disimpan");
        closeDlg();
        fetchAll();
        onSuccess?.();
      } else toast.error(res.error || "Gagal menyimpan");
    } catch { toast.error("Terjadi kesalahan"); }
  }

  // ── PUT helper
  async function doPut(endpoint: string, body: any) {
    try {
      const res = await apiClient(endpoint, { method: "PUT", body });
      if (!res.success) toast.error(res.error || "Gagal mengupdate");
    } catch { toast.error("Terjadi kesalahan saat update"); }
  }

  async function doDelete(endpoint: string, id: number) {
    try {
      const res = await apiClient(`${endpoint}/${id}`, { method: "DELETE" });
      if (res.success) { toast.success("Berhasil dihapus"); fetchAll(); }
      else toast.error(res.error || "Gagal menghapus");
    } catch { toast.error("Terjadi kesalahan"); }
  }

  const doDeleteCategory = (cat: Category) => {
    const node = tree.find(n => n.category.id === cat.id);
    const groupCount = node?.groups.length ?? 0;
    const msg = groupCount > 0
      ? `Kategori "${cat.name}" memiliki ${groupCount} kelompok perilaku dan SOP/sanksi terkait. Semua data tersebut akan ikut terhapus. Lanjutkan?`
      : `Hapus kategori "${cat.name}"?`;
    if (confirm(msg)) doDelete("/discipline-handbook/categories", cat.id);
  };

  const doDeleteLevel = (lvl: EducationLevel) => {
    const gCount = guidelines.filter(g => g.level_id === lvl.id).length;
    const cCount = consequences.filter(c => c.level_id === lvl.id).length;
    const dCount = documents.filter(d => d.level_id === lvl.id).length;
    const bCount = tree.flatMap(n => n.groups.flatMap(g => g.behaviors)).filter(b => b.levels.some(l => l.id === lvl.id)).length;
    const total = gCount + cCount + dCount + bCount;
    const msg = total > 0
      ? `Jenjang "${lvl.name}" digunakan di ${total} data (SOP: ${gCount}, Sanksi: ${cCount}, Dokumen: ${dCount}, Perilaku: ${bCount}). Semua akan ikut terhapus. Lanjutkan?`
      : `Hapus jenjang "${lvl.name}"?`;
    if (confirm(msg)) doDelete("/discipline-handbook/levels", lvl.id);
  };

  const catName = (id: number) => categories.find(c => c.id === id)?.name ?? `Kategori ${id}`;
  const levelName = (id: number) => levels.find(l => l.id === id)?.name ?? `Jenjang ${id}`;
  const levelCode = (id: number) => levels.find(l => l.id === id)?.code ?? `?`;

  // ── Expanded state for tree accordion
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["1-group-1", "2-group-3", "3-group-5", "4-group-7"]));
  const toggle = (key: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7" /> Buku Pedoman Disiplin
          </h1>
          <p className="text-muted-foreground mt-1">Kelola semua isi buku pedoman — kategori, perilaku, SOP, sanksi, dan dokumen.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      {/* ── TAB NAVIGATION (horizontal top bar) ── */}
      <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-3">
        <TabsPrimitive.List className="grid grid-cols-6 min-w-0 w-fit">
          <TabsPrimitive.Tab value="tree" className="text-xs"><Layers className="h-3 w-3 mr-1 shrink-0" />Struktur</TabsPrimitive.Tab>
          <TabsPrimitive.Tab value="categories" className="text-xs"><Scale className="h-3 w-3 mr-1 shrink-0" />Kategori</TabsPrimitive.Tab>
          <TabsPrimitive.Tab value="levels" className="text-xs"><GraduationCap className="h-3 w-3 mr-1 shrink-0" />Jenjang</TabsPrimitive.Tab>
          <TabsPrimitive.Tab value="guidelines" className="text-xs"><FileText className="h-3 w-3 mr-1 shrink-0" />SOP</TabsPrimitive.Tab>
          <TabsPrimitive.Tab value="consequences" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1 shrink-0" />Sanksi</TabsPrimitive.Tab>
          <TabsPrimitive.Tab value="documents" className="text-xs"><FileText className="h-3 w-3 mr-1 shrink-0" />Dokumen</TabsPrimitive.Tab>
        </TabsPrimitive.List>

        {/* ── STRUKTUR ── */}
        <TabsPrimitive.Panel value="tree" className="space-y-4">
          {/* Quick-add buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => openDlg("add-group")}><Plus className="h-3 w-3 mr-1" />Tambah Kelompok</Button>
            <Button size="sm" variant="outline" onClick={() => openDlg("add-behavior")}><Plus className="h-3 w-3 mr-1" />Tambah Perilaku</Button>
            <Button size="sm" variant="outline" onClick={() => openDlg("add-consequence")}><Plus className="h-3 w-3 mr-1" />Tambah Sanksi</Button>
          </div>

          {/* Tree */}
          <div className="space-y-3">
            {tree.map((node, i) => {
              const colorMap: Record<number, string> = { 1: "border-l-green-500", 2: "border-l-yellow-500", 3: "border-l-orange-500", 4: "border-l-red-500" };
              return (
                <Card key={`tree-${i}-${node.category.id}`} className={`border-l-4 ${colorMap[node.category.id] ?? "border-l-gray-400"}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{node.category.name}</CardTitle>
                      <Button size="sm" variant="ghost" onClick={() => openDlg("edit-category", node.category)}><Pencil className="h-3 w-3" /></Button>
                    </div>
                    {node.category.general_description && <CardDescription className="text-xs">{node.category.general_description}</CardDescription>}
                    {/* Impact pills */}
                    <div className="flex gap-1 flex-wrap mt-1">
                      {node.category.impact_victim && <Badge variant="secondary" className="text-[10px]">👤 {node.category.impact_victim.slice(0, 40)}…</Badge>}
                      {node.category.impact_perpetrator && <Badge variant="secondary" className="text-[10px]">⚠️ {node.category.impact_perpetrator.slice(0, 40)}…</Badge>}
                      {node.category.impact_school && <Badge variant="secondary" className="text-[10px]">🏫 {node.category.impact_school.slice(0, 40)}…</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {node.groups.map(grp => {
                      const grpKey = `${node.category.id}-group-${grp.group.id}`;
                      return (
                        <div key={grpKey} className="border rounded-md">
                          <button className="w-full flex items-center justify-between p-2 hover:bg-muted/50 rounded-t-md text-left" onClick={() => toggle(grpKey)}>
                            <span className="text-sm font-medium">{grp.group.group_name}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">{grp.behaviors.length} butir</Badge>
                              {expanded.has(grpKey) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </div>
                          </button>
                          {expanded.has(grpKey) && (
                            <div className="border-t p-2 space-y-1">
                              {grp.behaviors.map(b => (
                                <div key={`${grpKey}-${b.id}`} className="flex items-start justify-between gap-2 text-xs p-1.5 rounded hover:bg-muted/50">
                                  <div className="flex-1">
                                    <span>{b.behavior_text}</span>
                                    <LevelBadge levels={b.levels} />
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => openDlg("edit-behavior", { ...b, group_name: grp.group.group_name })}><Pencil className="h-2.5 w-2.5" /></Button>
                                    <Button size="icon" variant="ghost" className="h-5 w-5 text-red-500 hover:text-red-600" onClick={() => { if (confirm(`Hapus "${b.behavior_text.slice(0, 30)}…"?`)) doDelete("/discipline-handbook/behaviors", b.id); }}><Trash2 className="h-2.5 w-2.5" /></Button>
                                  </div>
                                </div>
                              ))}
                              {grp.behaviors.length === 0 && <p className="text-xs text-muted-foreground italic">Belum ada butir perilaku</p>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {node.groups.length === 0 && <p className="text-xs text-muted-foreground italic">Belum ada kelompok perilaku</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsPrimitive.Panel>

        {/* ── KATEGORI ── */}
        <TabsPrimitive.Panel value="categories" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openDlg("add-category")}><Plus className="h-4 w-4 mr-1" />Tambah Kategori</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {categories.map(c => {
            const node = tree.find(n => n.category.id === c.id);
            return <CategoryCard key={c.id} cat={c} groupCount={node?.groups.length ?? 0} onEdit={(cat) => openDlg("edit-category", cat)} onDelete={doDeleteCategory} />;
          })}
          </div>
          {categories.length === 0 && <p className="text-muted-foreground text-sm">Belum ada kategori.</p>}
        </TabsPrimitive.Panel>

        {/* ── JENJANG ── */}
        <TabsPrimitive.Panel value="levels" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openDlg("add-level")}><Plus className="h-4 w-4 mr-1" />Tambah Jenjang</Button>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            {levels.map(l => (
              <Card key={l.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div><span className="font-bold text-lg">{l.code}</span><p className="text-xs text-muted-foreground">{l.name}</p></div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openDlg("edit-level", l)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => doDeleteLevel(l)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {levels.length === 0 && <p className="text-muted-foreground text-sm">Belum ada jenjang.</p>}
        </TabsPrimitive.Panel>

        {/* ── SOP ── */}
        <TabsPrimitive.Panel value="guidelines" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openDlg("add-guideline")}><Plus className="h-4 w-4 mr-1" />Tambah SOP</Button>
          </div>
          <div className="space-y-2">
            {guidelines.map(g => (
              <Card key={g.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge>{catName(g.category_id)}</Badge>
                        <Badge variant="outline">{levelName(g.level_id)}</Badge>
                        <Badge variant="secondary">{g.target_type}</Badge>
                        <Badge>Langkah {g.step_number}</Badge>
                      </div>
                      <p className="text-sm">{g.guideline_text}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => openDlg("edit-guideline", g)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm("Hapus SOP ini?")) doDelete("/discipline-handbook/guidelines", g.id); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {guidelines.length === 0 && <p className="text-muted-foreground text-sm">Belum ada SOP.</p>}
        </TabsPrimitive.Panel>

        {/* ── KONSEKUENSI / SANKSI ── */}
        <TabsPrimitive.Panel value="consequences" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openDlg("add-consequence")}><Plus className="h-4 w-4 mr-1" />Tambah Sanksi</Button>
          </div>
          <div className="space-y-2">
            {consequences.map(c => (
              <Card key={c.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge>{catName(c.category_id)}</Badge>
                        <Badge variant="outline">{levelName(c.level_id)}</Badge>
                        <Badge variant="secondary">{c.consequence_type}</Badge>
                      </div>
                      <p className="text-sm">{c.consequence_text}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => openDlg("edit-consequence", c)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm("Hapus sanksi ini?")) doDelete("/discipline-handbook/consequences", c.id); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {consequences.length === 0 && <p className="text-muted-foreground text-sm">Belum ada sanksi.</p>}
        </TabsPrimitive.Panel>

        {/* ── DOKUMEN ADMINISTRASI ── */}
        <TabsPrimitive.Panel value="documents" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openDlg("add-document")}><Plus className="h-4 w-4 mr-1" />Tambah Dokumen</Button>
          </div>
          <div className="space-y-2">
            {documents.map(d => (
              <Card key={d.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge>{catName(d.category_id)}</Badge>
                        <Badge variant="outline">{levelName(d.level_id)}</Badge>
                        <Badge variant="secondary">{d.document_name}</Badge>
                      </div>
                      {d.template_url && <a href={d.template_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">{d.template_url}</a>}
                      {d.description && <p className="text-xs text-muted-foreground mt-1">{d.description}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => openDlg("edit-document", d)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm("Hapus dokumen ini?")) doDelete("/discipline-handbook/documents", d.id); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {documents.length === 0 && <p className="text-muted-foreground text-sm">Belum ada dokumen.</p>}
        </TabsPrimitive.Panel>
      </TabsPrimitive.Root>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIALOGS */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* ── Add/Edit Category ── */}
      <Dialog open={dlg.open === "add-category" || dlg.open === "edit-category"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? "Edit Kategori" : "Tambah Kategori"}</DialogTitle>
            <DialogDescription>4 tingkatan pelanggaran: Ringan, Sedang, Berat, Sangat Berat</DialogDescription>
          </DialogHeader>
          <FormCategory data={dlg.data} onSubmit={(body) => {
            if (dlg.data?.id) doPost("/discipline-handbook/categories", { ...body, id: dlg.data.id }, () => {});
            else doPost("/discipline-handbook/categories", body);
          }} />
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Level ── */}
      <Dialog open={dlg.open === "add-level" || dlg.open === "edit-level"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? "Edit Jenjang" : "Tambah Jenjang"}</DialogTitle>
          </DialogHeader>
          <FormLevel data={dlg.data} onSubmit={(body) => {
            if (dlg.data?.id) doPost("/discipline-handbook/levels", { ...body, id: dlg.data.id }, () => {});
            else doPost("/discipline-handbook/levels", body);
          }} />
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Group ── */}
      <Dialog open={dlg.open === "add-group"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tambah Kelompok Perilaku</DialogTitle></DialogHeader>
          <FormGroup categories={categories} onSubmit={(body) => doPost("/discipline-handbook/groups", body)} />
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Behavior ── */}
      <Dialog open={dlg.open === "add-behavior" || dlg.open === "edit-behavior"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? `Edit Perilaku: "${dlg.data.behavior_text?.slice(0, 30)}…"` : "Tambah Perilaku Spesifik"}</DialogTitle>
            <DialogDescription>Pilih kelompok perilaku dan tentukan jenjang yang berlaku.</DialogDescription>
          </DialogHeader>
          <FormBehavior data={dlg.data} categories={categories} groups={tree.flatMap(n => n.groups.map(g => g.group))} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) {
              doPost("/discipline-handbook/behaviors", { ...body, id: dlg.data.id }, () => doPut(`/discipline-handbook/behaviors/${dlg.data.id}/levels`, { level_ids: body.level_ids }));
            } else {
              doPost("/discipline-handbook/behaviors", { group_id: body.group_id, behavior_text: body.behavior_text }, () => {});
            }
          }} />
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit SOP ── */}
      <Dialog open={dlg.open === "add-guideline" || dlg.open === "edit-guideline"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dlg.data?.id ? "Edit SOP" : "Tambah SOP"}</DialogTitle></DialogHeader>
          <FormGuideline data={dlg.data} categories={categories} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) doPost("/discipline-handbook/guidelines", { ...body, id: dlg.data.id }, () => {});
            else doPost("/discipline-handbook/guidelines", body);
          }} />
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Sanksi ── */}
      <Dialog open={dlg.open === "add-consequence" || dlg.open === "edit-consequence"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dlg.data?.id ? "Edit Sanksi" : "Tambah Sanksi / Konsekuensi"}</DialogTitle></DialogHeader>
          <FormConsequence data={dlg.data} categories={categories} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) doPost("/discipline-handbook/consequences", { ...body, id: dlg.data.id }, () => {});
            else doPost("/discipline-handbook/consequences", body);
          }} />
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Document ── */}
      <Dialog open={dlg.open === "add-document" || dlg.open === "edit-document"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dlg.data?.id ? "Edit Dokumen" : "Tambah Dokumen Administrasi"}</DialogTitle></DialogHeader>
          <FormDocument data={dlg.data} categories={categories} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) doPost("/discipline-handbook/documents", { ...body, id: dlg.data.id }, () => {});
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

function FormCategory({ data, onSubmit }: { data?: Category; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ name: data?.name ?? "", general_description: data?.general_description ?? "", impact_victim: data?.impact_victim ?? "", impact_perpetrator: data?.impact_perpetrator ?? "", impact_school: data?.impact_school ?? "" });
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaving(true); onSubmit(f); setSaving(false); }} className="space-y-3">
      <div><Label> Nama Kategori *</Label><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required placeholder="contoh: Pelanggaran Ringan" /></div>
      <div><Label>Deskripsi Umum</Label><Textarea rows={2} value={f.general_description} onChange={e => setF({ ...f, general_description: e.target.value })} placeholder="Ciri-ciri utama kategori" /></div>
      <div><Label>Dampak bagi Korban</Label><Textarea rows={2} value={f.impact_victim} onChange={e => setF({ ...f, impact_victim: e.target.value })} /></div>
      <div><Label>Dampak bagi Pelaku</Label><Textarea rows={2} value={f.impact_perpetrator} onChange={e => setF({ ...f, impact_perpetrator: e.target.value })} /></div>
      <div><Label>Dampak bagi Sekolah</Label><Textarea rows={2} value={f.impact_school} onChange={e => setF({ ...f, impact_school: e.target.value })} /></div>
      <DialogFooter><Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-1" />Simpan</Button></DialogFooter>
    </form>
  );
}

function FormLevel({ data, onSubmit }: { data?: EducationLevel; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ code: data?.code ?? "", name: data?.name ?? "", sort_order: data?.sort_order ?? 0 });
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaving(true); onSubmit(f); setSaving(false); }} className="space-y-3">
      <div><Label>Kode *</Label><Input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} required placeholder="TK / SD / SMP / SMA" maxLength={10} /></div>
      <div><Label>Nama Lengkap *</Label><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required placeholder="Taman Kanak-Kanak / Sekolah Dasar" /></div>
      <div><Label>Urutan Tampilan</Label><Input type="number" value={f.sort_order} onChange={e => setF({ ...f, sort_order: Number(e.target.value) })} /></div>
      <DialogFooter><Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-1" />Simpan</Button></DialogFooter>
    </form>
  );
}

function FormGroup({ categories, onSubmit }: { categories: Category[]; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category_id: "", group_name: "", description: "" });
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.category_id) { toast.error("Pilih kategori"); return; } setSaving(true); onSubmit({ ...f, category_id: Number(f.category_id) }); setSaving(false); }} className="space-y-3">
      <div><Label>Kategori *</Label>
        <Select value={f.category_id} onValueChange={v => setF({ ...f, category_id: v })}>
          <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
          <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Nama Kelompok *</Label><Input value={f.group_name} onChange={e => setF({ ...f, group_name: e.target.value })} required placeholder="contoh: Kekerasan Fisik Berbahaya" /></div>
      <div><Label>Deskripsi</Label><Textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
      <DialogFooter><Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-1" />Simpan</Button></DialogFooter>
    </form>
  );
}

function FormBehavior({ data, categories, groups, levels, onSubmit }: { data?: any; categories: Category[]; groups: BehaviorGroup[]; levels: EducationLevel[]; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category_id: data ? String(groups.find(g => g.id === data.group_id)?.category_id ?? "") : "", group_id: data ? String(data.group_id) : "", behavior_text: data?.behavior_text ?? "", level_ids: data?.levels?.map((l: Level) => l.id) ?? [] });
  const [saving, setSaving] = useState(false);

  const filteredGroups = f.category_id ? groups.filter(g => g.category_id === Number(f.category_id)) : groups;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.group_id) { toast.error("Pilih kelompok perilaku"); return; }
    setSaving(true);
    onSubmit({ group_id: Number(f.group_id), behavior_text: f.behavior_text, level_ids: f.level_ids });
    setSaving(false);
  };

  const toggleLevel = (id: number) => {
    setF(prev => ({ ...prev, level_ids: prev.level_ids.includes(id) ? prev.level_ids.filter(l => l !== id) : [...prev.level_ids, id] }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><Label>Kategori *</Label>
        <Select value={f.category_id} onValueChange={v => setF({ ...f, category_id: v, group_id: "" })}>
          <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
          <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Kelompok Perilaku *</Label>
        <Select value={f.group_id} onValueChange={v => setF({ ...f, group_id: v })}>
          <SelectTrigger><SelectValue placeholder="Pilih kelompok" /></SelectTrigger>
          <SelectContent>{filteredGroups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.group_name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Butir Perilaku *</Label><Textarea rows={3} value={f.behavior_text} onChange={e => setF({ ...f, behavior_text: e.target.value })} required placeholder="contoh: Mencekik leher seseorang dengan sengaja." /></div>
      <div>
        <Label>Berlaku untuk Jenjang *</Label>
        <div className="flex gap-2 mt-1 flex-wrap">
          {levels.map(l => (
            <button key={l.id} type="button" onClick={() => toggleLevel(l.id)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${f.level_ids.includes(l.id) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}>
              {l.code}
            </button>
          ))}
        </div>
        {f.level_ids.length === 0 && <p className="text-xs text-orange-500 mt-1">Pilih minimal 1 jenjang</p>}
      </div>
      <DialogFooter><Button type="submit" disabled={saving || f.level_ids.length === 0}><Save className="h-4 w-4 mr-1" />Simpan</Button></DialogFooter>
    </form>
  );
}

function FormGuideline({ data, categories, levels, onSubmit }: { data?: HandlingGuideline; categories: Category[]; levels: EducationLevel[]; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category_id: data ? String(data.category_id) : "", level_id: data ? String(data.level_id) : "", target_type: data?.target_type ?? "Identifikasi Awal", step_number: data?.step_number ?? 1, guideline_text: data?.guideline_text ?? "" });
  const [saving, setSaving] = useState(false);
  const TARGET_TYPES = ["Identifikasi Awal", "Penanganan Pelaku", "Penanganan Korban", "Kolaborasi Orang Tua", "Koordinasi"];
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaving(true); onSubmit({ ...f, category_id: Number(f.category_id), level_id: Number(f.level_id), step_number: Number(f.step_number) }); setSaving(false); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Kategori *</Label>
          <Select value={f.category_id} onValueChange={v => setF({ ...f, category_id: v })}>
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Jenjang *</Label>
          <Select value={f.level_id} onValueChange={v => setF({ ...f, level_id: v })}>
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>{levels.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.code} — {l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Tahap *</Label>
          <Select value={f.target_type} onValueChange={v => setF({ ...f, target_type: v ?? "Identifikasi Awal" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TARGET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>No. Langkah *</Label><Input type="number" min={1} value={f.step_number} onChange={e => setF({ ...f, step_number: Number(e.target.value) })} /></div>
      </div>
      <div><Label>Isi Langkah *</Label><Textarea rows={4} value={f.guideline_text} onChange={e => setF({ ...f, guideline_text: e.target.value })} required placeholder="Detail langkah penanganan…" /></div>
      <DialogFooter><Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-1" />Simpan</Button></DialogFooter>
    </form>
  );
}

function FormConsequence({ data, categories, levels, onSubmit }: { data?: ConsequenceGuideline; categories: Category[]; levels: EducationLevel[]; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category_id: data ? String(data.category_id) : "", level_id: data ? String(data.level_id) : "", consequence_type: data?.consequence_type ?? "", consequence_text: data?.consequence_text ?? "" });
  const [saving, setSaving] = useState(false);
  const CONSEQUENCE_TYPES = ["Tugas Reflektif", "Perbaikan Langsung", "Pembatasan Sementara", "Konferensi Keluarga", "Skorsing", "Skorsing Ringan", "Skorsing Berat", "Ganti Rugi", "Tugas Karakter", "Pelanggaran Surat Pernyataan", "Koordinasi Pihak Luar"];
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaving(true); onSubmit({ ...f, category_id: Number(f.category_id), level_id: Number(f.level_id) }); setSaving(false); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Kategori *</Label>
          <Select value={f.category_id} onValueChange={v => setF({ ...f, category_id: v })}>
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Jenjang *</Label>
          <Select value={f.level_id} onValueChange={v => setF({ ...f, level_id: v })}>
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>{levels.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.code} — {l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Jenis Sanksi *</Label>
        <Select value={f.consequence_type} onValueChange={v => setF({ ...f, consequence_type: v ?? "" })}>
          <SelectTrigger><SelectValue placeholder="Pilih jenis sanksi" /></SelectTrigger>
          <SelectContent>{CONSEQUENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Detail Sanksi *</Label><Textarea rows={4} value={f.consequence_text} onChange={e => setF({ ...f, consequence_text: e.target.value })} required placeholder="Contoh: SD: Menulis surat permintaan maaf. SMA: Membuat esai refleksi 500 kata." /></div>
      <DialogFooter><Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-1" />Simpan</Button></DialogFooter>
    </form>
  );
}

function FormDocument({ data, categories, levels, onSubmit }: { data?: RequiredDocument; categories: Category[]; levels: EducationLevel[]; onSubmit: (b: any) => void }) {
  const [f, setF] = useState({ category_id: data ? String(data.category_id) : "", level_id: data ? String(data.level_id) : "", document_name: data?.document_name ?? "", template_url: data?.template_url ?? "", description: data?.description ?? "" });
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaving(true); onSubmit({ ...f, category_id: Number(f.category_id), level_id: Number(f.level_id) }); setSaving(false); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Kategori *</Label>
          <Select value={f.category_id} onValueChange={v => setF({ ...f, category_id: v })}>
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Jenjang *</Label>
          <Select value={f.level_id} onValueChange={v => setF({ ...f, level_id: v })}>
            <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
            <SelectContent>{levels.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.code} — {l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>Nama Dokumen *</Label><Input value={f.document_name} onChange={e => setF({ ...f, document_name: e.target.value })} required placeholder="Surat Pernyataan Menerima Konsekuensi" /></div>
      <div><Label>URL Template</Label><Input value={f.template_url} onChange={e => setF({ ...f, template_url: e.target.value })} placeholder="/templates/disiplin/surat-pernyataan.docx" /></div>
      <div><Label>Deskripsi</Label><Textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
      <DialogFooter><Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-1" />Simpan</Button></DialogFooter>
    </form>
  );
}