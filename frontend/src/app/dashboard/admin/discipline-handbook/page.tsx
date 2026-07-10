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
  Layers, Scale, GraduationCap, FileText, AlertTriangle, FolderOpen, Users,
  ExternalLink, X
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

// ─── Constants ────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<number, { border: string; bg: string; text: string; dot: string; badge: string; desc: string }> = {
  1: { border: "border-l-green-500", bg: "bg-green-100 dark:bg-green-950 border border-green-200 dark:border-green-800", text: "text-green-800 dark:text-green-200", dot: "bg-green-500", badge: "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200", desc: "text-green-700/70 dark:text-green-300/70" },
  2: { border: "border-l-yellow-500", bg: "bg-yellow-100 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800", text: "text-yellow-800 dark:text-yellow-200", dot: "bg-yellow-500", badge: "bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", desc: "text-yellow-700/70 dark:text-yellow-300/70" },
  3: { border: "border-l-orange-500", bg: "bg-orange-100 dark:bg-orange-950 border border-orange-200 dark:border-orange-800", text: "text-orange-800 dark:text-orange-200", dot: "bg-orange-500", badge: "bg-orange-200 text-orange-800 dark:bg-orange-900 dark:text-orange-200", desc: "text-orange-700/70 dark:text-orange-300/70" },
  4: { border: "border-l-red-500", bg: "bg-red-100 dark:bg-red-950 border border-red-200 dark:border-red-800", text: "text-red-800 dark:text-red-200", dot: "bg-red-500", badge: "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200", desc: "text-red-700/70 dark:text-red-300/70" },
};

const CONSEQUENCE_BADGE: Record<string, string> = {
  "Tugas Reflektif": "bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100",
  "Perbaikan Langsung": "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
  "Pembatasan Sementara": "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  "Konferensi Keluarga": "bg-violet-200 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
  "Skorsing": "bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100",
  "Skorsing Ringan": "bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100",
  "Skorsing Berat": "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100",
  "Ganti Rugi": "bg-teal-200 text-teal-900 dark:bg-teal-900 dark:text-teal-100",
  "Tugas Karakter": "bg-indigo-200 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100",
  "Pelanggaran Surat Pernyataan": "bg-pink-200 text-pink-900 dark:bg-pink-900 dark:text-pink-100",
  "Koordinasi Pihak Luar": "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-200",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LevelBadge({ levels }: { levels: Level[] }) {
  return <div className="flex gap-1 flex-wrap">{levels.map(l => <Badge key={l.id} variant="outline" className="text-xs font-mono px-1.5">{l.code}</Badge>)}</div>;
}

function SectionHeader({ icon: Icon, title, count, action }: { icon: any; title: string; count: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 px-1 border-b">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{title}</span>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </div>
      {action}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminDisciplineHandbookPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("structure");

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
    } catch { toast.error("Gagal memuat data buku pedoman"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function doPost(endpoint: string, body: any, onSuccess?: () => void) {
    try {
      const res = await apiClient(endpoint, { method: "POST", body });
      if (res.success) { toast.success("Berhasil disimpan"); closeDlg(); fetchAll(); onSuccess?.(); }
      else toast.error(res.error || "Gagal menyimpan");
    } catch { toast.error("Terjadi kesalahan"); }
  }

  async function doPut(endpoint: string, body: any, onSuccess?: () => void) {
    try {
      const res = await apiClient(endpoint, { method: "PUT", body });
      if (res.success) { toast.success("Berhasil diupdate"); closeDlg(); fetchAll(); onSuccess?.(); }
      else toast.error(res.error || "Gagal mengupdate");
    } catch { toast.error("Terjadi kesalahan saat update"); }
  }

  async function doDelete(endpoint: string, id: number, label: string) {
    if (!confirm(`Hapus "${label}"?`)) return;
    try {
      const res = await apiClient(`${endpoint}/${id}`, { method: "DELETE" });
      if (res.success) { toast.success("Berhasil dihapus"); fetchAll(); }
      else toast.error(res.error || "Gagal menghapus");
    } catch { toast.error("Terjadi kesalahan"); }
  }

  const catName = (id: number) => categories.find(c => c.id === id)?.name ?? `Kat. ${id}`;
  const levelName = (id: number) => levels.find(l => l.id === id)?.name ?? `Jenjang ${id}`;
  const levelCode = (id: number) => levels.find(l => l.id === id)?.code ?? `?`;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5 p-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Buku Pedoman Disiplin
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Kelola kategori, jenjang, SOP penanganan, sanksi, dan dokumen.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="rounded-lg border bg-card">
        <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab}>
          <TabsPrimitive.List className="flex w-full overflow-x-auto rounded-t-lg border-b bg-card/60 md:grid md:grid-cols-6">
            {[
              { value: "structure", icon: Layers, label: "Struktur" },
              { value: "categories", icon: Scale, label: "Kategori" },
              { value: "levels", icon: GraduationCap, label: "Jenjang" },
              { value: "guidelines", icon: FileText, label: "SOP" },
              { value: "consequences", icon: AlertTriangle, label: "Sanksi" },
              { value: "documents", icon: FolderOpen, label: "Dokumen" },
            ].map(({ value, icon: Icon, label }) => (
              <TabsPrimitive.Tab
                key={value}
                value={value}
                className="flex shrink-0 items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all outline-none cursor-pointer border-b-2 border-transparent data-selected:text-primary data-selected:border-primary data-selected:bg-primary/5 md:flex-1"
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </TabsPrimitive.Tab>
            ))}
          </TabsPrimitive.List>

          {/* ══════════════ STRUKTUR ══════════════ */}
          <TabsPrimitive.Panel value="structure" className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Hierarki kategori → kelompok → butir perilaku</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openDlg("add-group")}><Plus className="h-3 w-3 mr-1" />Kelompok</Button>
                <Button size="sm" variant="outline" onClick={() => openDlg("add-behavior")}><Plus className="h-3 w-3 mr-1" />Perilaku</Button>
              </div>
            </div>

            {tree.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Layers className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada struktur. Tambahkan kategori dan jenjang terlebih dahulu.</p>
              </div>
            )}

            {tree.map(node => {
              const colors = CAT_COLORS[node.category.id] ?? { border: "border-l-gray-400", bg: "bg-muted border border-border", text: "text-foreground", dot: "bg-gray-400", badge: "bg-muted text-muted-foreground", desc: "text-muted-foreground" };
              const totalBehaviors = node.groups.reduce((s, g) => s + g.behaviors.length, 0);
              return (
                <div key={node.category.id} className={`rounded-lg border border-l-4 ${colors.border} ${colors.bg}`}>
                  {/* Category header */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                      <div>
                        <span className={`font-semibold text-sm ${colors.text}`}>{node.category.name}</span>
                        {node.category.general_description && (
                          <p className={`text-xs mt-0.5 ${colors.desc}`}>{node.category.general_description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        <Badge variant="outline" className={`text-xs font-medium ${colors.badge}`}>{node.groups.length} kelompok</Badge>
                        <Badge variant="outline" className={`text-xs font-medium ${colors.badge}`}>{totalBehaviors} perilaku</Badge>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDlg("edit-category", node.category)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Groups */}
                  {node.groups.length > 0 && (
                    <div className="border-t px-4 py-3 space-y-2">
                      {node.groups.map(grp => {
                        const grpKey = `${node.category.id}-grp-${grp.group.id}`;
                        return (
                          <div key={grpKey} className="rounded-lg border overflow-hidden">
                            <button
                              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/50 hover:bg-muted/80 transition-colors"
                              onClick={() => toggle(grpKey)}
                            >
                              <div className="flex items-center gap-2.5 text-left">
                                <span className="text-sm font-medium">{grp.group.group_name}</span>
                                <Badge variant="outline" className="text-xs font-medium">{grp.behaviors.length} butir</Badge>
                              </div>
                              {expanded.has(grpKey)
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                              }
                            </button>

                            {expanded.has(grpKey) && (
                              <div className="border-t">
                                {grp.behaviors.length === 0 ? (
                                  <p className="text-sm text-muted-foreground italic px-4 py-3">Belum ada butir perilaku — klik edit untuk menambahkan.</p>
                                ) : grp.behaviors.map(b => (
                                  <div key={b.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50 text-sm border-b last:border-0">
                                    <span className="flex-1 leading-relaxed">{b.behavior_text}</span>
                                    <LevelBadge levels={b.levels} />
                                    <div className="flex gap-0.5 shrink-0">
                                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => openDlg("edit-behavior", { ...b, group_name: grp.group.group_name })}>
                                        <Pencil className="h-2.5 w-2.5" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-5 w-5 text-red-500 hover:text-red-600" onClick={() => doDelete("/discipline-handbook/behaviors", b.id, b.behavior_text.slice(0, 30))}>
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {node.groups.length === 0 && (
                    <div className="border-t px-4 py-2">
                      <p className="text-xs text-muted-foreground italic">Belum ada kelompok perilaku</p>
                    </div>
                  )}
                </div>
              );
            })}
          </TabsPrimitive.Panel>

          {/* ══════════════ KATEGORI ══════════════ */}
          <TabsPrimitive.Panel value="categories" className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">4 tingkatan pelanggaran: Ringan, Sedang, Berat, Sangat Berat</p>
              <Button size="sm" onClick={() => openDlg("add-category")}><Plus className="h-3 w-3 mr-1" />Tambah</Button>
            </div>

            {categories.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Scale className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada kategori.</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {categories.map(c => {
                  const colors = CAT_COLORS[c.id] ?? { border: "border-l-gray-400", bg: "bg-muted border border-border", text: "text-foreground", dot: "bg-gray-400", badge: "bg-muted text-muted-foreground", desc: "text-muted-foreground" };
                  const node = tree.find(n => n.category.id === c.id);
                  const groupCount = node?.groups.length ?? 0;
                  const behaviorCount = node?.groups.reduce((s, g) => s + g.behaviors.length, 0) ?? 0;
                  return (
                    <div key={c.id} className={`rounded-lg border border-l-4 ${colors.border} ${colors.bg} p-4`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                            <span className={`font-semibold text-sm ${colors.text}`}>{c.name}</span>
                            <Badge variant="outline" className="text-[10px] font-mono">#{c.id}</Badge>
                          </div>
                          {c.general_description && <p className={`text-xs mb-2 ${colors.desc}`}>{c.general_description}</p>}
                          <div className="flex gap-2 flex-wrap">
                            <Badge className={`text-xs font-medium ${colors.badge}`}>{groupCount} kelompok</Badge>
                            <Badge className={`text-xs font-medium ${colors.badge}`}>{behaviorCount} perilaku</Badge>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDlg("edit-category", c)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => {
                            const msg = groupCount > 0
                              ? `Hapus "${c.name}" beserta ${groupCount} kelompok dan semua data terkait?`
                              : `Hapus "${c.name}"?`;
                            if (confirm(msg)) doDelete("/discipline-handbook/categories", c.id, c.name);
                          }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {/* Impact summary */}
                      {(c.impact_victim || c.impact_perpetrator || c.impact_school) && (
                        <div className={`mt-3 pt-2 border-t space-y-1 ${colors.desc}`}>
                          {c.impact_victim && <p className="text-[10px]">👤 {c.impact_victim}</p>}
                          {c.impact_perpetrator && <p className="text-[10px]">⚠️ {c.impact_perpetrator}</p>}
                          {c.impact_school && <p className="text-[10px]">🏫 {c.impact_school}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsPrimitive.Panel>

          {/* ══════════════ JENJANG ══════════════ */}
          <TabsPrimitive.Panel value="levels" className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Jenjang pendidikan yang berlaku untuk SOP dan sanksi</p>
              <Button size="sm" onClick={() => openDlg("add-level")}><Plus className="h-3 w-3 mr-1" />Tambah</Button>
            </div>

            {levels.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada jenjang.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {levels.sort((a, b) => a.sort_order - b.sort_order).map(l => (
                  <div key={l.id} className="rounded-lg border p-4 flex items-start justify-between gap-2 hover:border-primary/40 transition-colors">
                    <div>
                      <span className="text-2xl font-bold font-mono text-primary">{l.code}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{l.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Urutan: {l.sort_order}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDlg("edit-level", l)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => {
                        const gCount = guidelines.filter(g => g.level_id === l.id).length;
                        const cCount = consequences.filter(c => c.level_id === l.id).length;
                        const dCount = documents.filter(d => d.level_id === l.id).length;
                        const total = gCount + cCount + dCount;
                        const msg = total > 0
                          ? `Hapus "${l.name}"? Terpakai di ${total} data (SOP:${gCount} Sanksi:${cCount} Dokumen:${dCount})`
                          : `Hapus "${l.name}"?`;
                        if (confirm(msg)) doDelete("/discipline-handbook/levels", l.id, l.name);
                      }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsPrimitive.Panel>

          {/* ══════════════ SOP ══════════════ */}
          <TabsPrimitive.Panel value="guidelines" className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Panduan penanganan per kategori, jenjang, dan tahap</p>
              <Button size="sm" onClick={() => openDlg("add-guideline")}><Plus className="h-3 w-3 mr-1" />Tambah</Button>
            </div>

            {guidelines.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada SOP.</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 border-b">
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-10">#</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Kategori</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Jenjang</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Tahap</th>
                      <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground w-14">Langkah</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Isi SOP</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground w-14">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guidelines.map((g, i) => (
                      <tr key={g.id} className={`border-b last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/15"} hover:bg-primary/5 transition-colors`}>
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{catName(g.category_id)}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs font-mono font-bold">{levelCode(g.level_id)}</Badge></td>
                        <td className="px-4 py-3"><Badge variant="secondary" className="text-xs">{g.target_type}</Badge></td>
                        <td className="px-4 py-3 text-center"><Badge className="text-xs bg-primary/15 text-primary border-0 font-bold">{g.step_number}</Badge></td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="line-clamp-2 leading-relaxed">{g.guideline_text}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDlg("edit-guideline", g)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => doDelete("/discipline-handbook/guidelines", g.id, `SOP #${g.id}`)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsPrimitive.Panel>

          {/* ══════════════ SANKSI ══════════════ */}
          <TabsPrimitive.Panel value="consequences" className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Jenis sanksi dan detail konsekuensi per kategori dan jenjang</p>
              <Button size="sm" onClick={() => openDlg("add-consequence")}><Plus className="h-3 w-3 mr-1" />Tambah</Button>
            </div>

            {consequences.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada sanksi.</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 border-b">
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-10">#</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Kategori</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Jenjang</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Jenis Sanksi</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Detail Sanksi</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground w-14">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consequences.map((c, i) => (
                      <tr key={c.id} className={`border-b last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/15"} hover:bg-primary/5 transition-colors`}>
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{catName(c.category_id)}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs font-mono font-bold">{levelCode(c.level_id)}</Badge></td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs font-medium ${CONSEQUENCE_BADGE[c.consequence_type] ?? "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}>
                            {c.consequence_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="line-clamp-2 leading-relaxed">{c.consequence_text}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDlg("edit-consequence", c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => doDelete("/discipline-handbook/consequences", c.id, `Sanksi #${c.id}`)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsPrimitive.Panel>

          {/* ══════════════ DOKUMEN ══════════════ */}
          <TabsPrimitive.Panel value="documents" className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Dokumen administrasi yang diperlukan per kategori dan jenjang</p>
              <Button size="sm" onClick={() => openDlg("add-document")}><Plus className="h-3 w-3 mr-1" />Tambah</Button>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada dokumen.</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 border-b">
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-10">#</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Nama Dokumen</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Kategori</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Jenjang</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Template</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Keterangan</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground w-14">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((d, i) => (
                      <tr key={d.id} className={`border-b last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/15"} hover:bg-primary/5 transition-colors`}>
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{d.document_name}</td>
                        <td className="px-4 py-3">{catName(d.category_id)}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs font-mono font-bold">{levelCode(d.level_id)}</Badge></td>
                        <td className="px-4 py-3">
                          {d.template_url ? (
                            <a href={d.template_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-blue-500 hover:underline">
                              <ExternalLink className="h-3 w-3" />
                              <span className="text-xs truncate max-w-[140px]">{d.template_url.split("/").pop()}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          {d.description ? <p className="line-clamp-2 leading-relaxed">{d.description}</p> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDlg("edit-document", d)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => doDelete("/discipline-handbook/documents", d.id, d.document_name)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsPrimitive.Panel>
        </TabsPrimitive.Root>
      </div>

      {/* ── Dialogs ── */}
      <Dialog open={dlg.open === "add-category" || dlg.open === "edit-category"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? "Edit Kategori" : "Tambah Kategori"}</DialogTitle>
            <DialogDescription>4 tingkatan: Ringan, Sedang, Berat, Sangat Berat</DialogDescription>
          </DialogHeader>
          <FormCategory data={dlg.data} onSubmit={(body) => {
            if (dlg.data?.id) doPut(`/discipline-handbook/categories/${dlg.data.id}`, body);
            else doPost("/discipline-handbook/categories", body);
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-level" || dlg.open === "edit-level"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dlg.data?.id ? "Edit Jenjang" : "Tambah Jenjang"}</DialogTitle></DialogHeader>
          <FormLevel data={dlg.data} onSubmit={(body) => {
            if (dlg.data?.id) doPut(`/discipline-handbook/levels/${dlg.data.id}`, body);
            else doPost("/discipline-handbook/levels", body);
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-group"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tambah Kelompok Perilaku</DialogTitle></DialogHeader>
          <FormGroup categories={categories} onSubmit={(body) => doPost("/discipline-handbook/groups", body)} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-behavior" || dlg.open === "edit-behavior"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlg.data?.id ? `Edit Perilaku` : "Tambah Perilaku Spesifik"}</DialogTitle>
            <DialogDescription>Pilih kelompok dan jenjang yang berlaku.</DialogDescription>
          </DialogHeader>
          <FormBehavior data={dlg.data} categories={categories} groups={tree.flatMap(n => n.groups.map(g => g.group))} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) {
              doPost("/discipline-handbook/behaviors", { ...body, id: dlg.data.id }, () => doPut(`/discipline-handbook/behaviors/${dlg.data.id}/levels`, { level_ids: body.level_ids }));
            } else {
              doPost("/discipline-handbook/behaviors", { group_id: body.group_id, behavior_text: body.behavior_text });
            }
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-guideline" || dlg.open === "edit-guideline"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dlg.data?.id ? "Edit SOP" : "Tambah SOP"}</DialogTitle></DialogHeader>
          <FormGuideline data={dlg.data} categories={categories} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) doPut(`/discipline-handbook/guidelines/${dlg.data.id}`, body);
            else doPost("/discipline-handbook/guidelines", body);
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-consequence" || dlg.open === "edit-consequence"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dlg.data?.id ? "Edit Sanksi" : "Tambah Sanksi"}</DialogTitle></DialogHeader>
          <FormConsequence data={dlg.data} categories={categories} levels={levels} onSubmit={(body) => {
            if (dlg.data?.id) doPut(`/discipline-handbook/consequences/${dlg.data.id}`, body);
            else doPost("/discipline-handbook/consequences", body);
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open === "add-document" || dlg.open === "edit-document"} onOpenChange={(o) => !o && closeDlg()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dlg.data?.id ? "Edit Dokumen" : "Tambah Dokumen"}</DialogTitle></DialogHeader>
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
  const toggleLevel = (id: number) => setF(prev => ({ ...prev, level_ids: prev.level_ids.includes(id) ? prev.level_ids.filter(l => l !== id) : [...prev.level_ids, id] }));
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