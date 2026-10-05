"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookOpen, RefreshCw, ChevronDown, ChevronRight,
  Layers, Scale, GraduationCap, FileText, AlertTriangle, FolderOpen, Search, X, Info,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Category {
  id: number; name: string; general_description: string | null;
  characteristics: string | null;
  impact_victim: string | null; impact_perpetrator: string | null; impact_school: string | null;
}
interface EducationLevel {
  id: number; code: string; name: string; sort_order: number;
}
interface BehaviorGroup {
  id: number; category_id: number; group_name: string; description: string | null;
}
interface BehaviorDetail {
  id: number; group_id: number; behavior_text: string;
}
interface Level { id: number; code: string; name: string; sort_order: number; }
interface BehaviorWithLevels extends BehaviorDetail { levels: Level[]; }
interface BehaviorGroupWithBehaviors { group: BehaviorGroup; behaviors: BehaviorWithLevels[]; }
interface HandbookTreeNode { category: Category; groups: BehaviorGroupWithBehaviors[]; }
interface HandlingGuideline {
  id: number; category_id: number; level_id: number;
  target_type: string; step_number: number; guideline_text: string;
}
interface ConsequenceGuideline {
  id: number; category_id: number; level_id: number;
  consequence_type: string; consequence_text: string;
}
interface RequiredDocument {
  id: number; category_id: number; level_id: number;
  document_name: string; template_url: string | null; description: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

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

// ─── Search/Filter Bar ─────────────────────────────────────────────────────────

function SearchBar({
  placeholder,
  value,
  onChange,
  onClear,
}: {
  placeholder: string; value: string; onChange: (v: string) => void; onClear?: () => void;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-8 h-8 text-xs pr-8"
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function SelectFilter({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className="h-8 text-xs w-auto min-w-[120px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{placeholder} — Semua</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Level Badge ───────────────────────────────────────────────────────────────

function LevelBadge({ levels }: { levels: Level[] }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {levels.map((l) => (
        <Badge key={l.id} variant="outline" className="text-xs font-mono px-1.5">{l.code}</Badge>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TeacherDisciplineHandbookPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("structure");

  // Data
  const [tree, setTree] = useState<HandbookTreeNode[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [levels, setLevels] = useState<EducationLevel[]>([]);
  const [guidelines, setGuidelines] = useState<HandlingGuideline[]>([]);
  const [consequences, setConsequences] = useState<ConsequenceGuideline[]>([]);
  const [documents, setDocuments] = useState<RequiredDocument[]>([]);

  // Expansion state (structure tab)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  // ── Search/Filter state ──────────────────────────────────────────────────────

  // Structure tab
  const [searchStructure, setSearchStructure] = useState("");

  // Categories tab
  const [searchCategory, setSearchCategory] = useState("");
  const [filterCategoryJenjang, setFilterCategoryJenjang] = useState("__all__");

  // Levels tab
  const [searchLevel, setSearchLevel] = useState("");

  // Guidelines tab
  const [searchGuideline, setSearchGuideline] = useState("");
  const [filterGuidelineCategory, setFilterGuidelineCategory] = useState("__all__");
  const [filterGuidelineLevel, setFilterGuidelineLevel] = useState("__all__");
  const [filterGuidelineTarget, setFilterGuidelineTarget] = useState("__all__");

  // Consequences tab
  const [searchConsequence, setSearchConsequence] = useState("");
  const [filterConsequenceCategory, setFilterConsequenceCategory] = useState("__all__");
  const [filterConsequenceLevel, setFilterConsequenceLevel] = useState("__all__");
  const [filterConsequenceType, setFilterConsequenceType] = useState("__all__");

  // Documents tab
  const [searchDocument, setSearchDocument] = useState("");
  const [filterDocumentCategory, setFilterDocumentCategory] = useState("__all__");
  const [filterDocumentLevel, setFilterDocumentLevel] = useState("__all__");

  // ── Fetch ───────────────────────────────────────────────────────────────────

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
    } catch { /* silent fail */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const catName = (id: number) => categories.find((c) => c.id === id)?.name ?? `Kat. ${id}`;
  const levelName = (id: number) => levels.find((l) => l.id === id)?.name ?? `Jenjang ${id}`;
  const levelCode = (id: number) => levels.find((l) => l.id === id)?.code ?? `?`;

  // Unique consequence types
  const consequenceTypes = useMemo(() => {
    return [...new Set(consequences.map((c) => c.consequence_type))].sort();
  }, [consequences]);

  // Unique target types
  const targetTypes = useMemo(() => {
    return [...new Set(guidelines.map((g) => g.target_type))].sort();
  }, [guidelines]);

  // ── Filtered data ────────────────────────────────────────────────────────────

  // Structure — search across category name, group name, behavior text, level codes
  const filteredTree = useMemo(() => {
    if (!searchStructure.trim()) return tree;
    const q = searchStructure.toLowerCase();
    return tree
      .map((node) => {
        const matchesCat =
          node.category.name.toLowerCase().includes(q) ||
          (node.category.general_description ?? "").toLowerCase().includes(q);
        const groups = node.groups
          .map((grp) => {
            const matchesGrp =
              grp.group.group_name.toLowerCase().includes(q) ||
              (grp.group.description ?? "").toLowerCase().includes(q);
            const behaviors = grp.behaviors.filter((b) => {
              const matchText = b.behavior_text.toLowerCase().includes(q);
              const matchLevel = b.levels.some((l) => l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q));
              return matchText || matchLevel;
            });
            return (matchesGrp || behaviors.length > 0)
              ? { ...grp, behaviors: matchesGrp ? grp.behaviors : behaviors }
              : null;
          })
          .filter(Boolean) as BehaviorGroupWithBehaviors[];
        return (matchesCat || groups.length > 0)
          ? { ...node, groups }
          : null;
      })
      .filter(Boolean) as HandbookTreeNode[];
  }, [tree, searchStructure]);

  // Categories
  const filteredCategories = useMemo(() => {
    let cats = categories;
    if (filterCategoryJenjang !== "__all__") {
      const lvlId = parseInt(filterCategoryJenjang);
      cats = cats.filter((c) => {
        const node = tree.find((n) => n.category.id === c.id);
        if (!node) return false;
        return node.groups.some((g) => g.behaviors.some((b) => b.levels.some((l) => l.id === lvlId)));
      });
    }
    if (!searchCategory.trim()) return cats;
    const q = searchCategory.toLowerCase();
    return cats.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.general_description ?? "").toLowerCase().includes(q) ||
      (c.impact_victim ?? "").toLowerCase().includes(q) ||
      (c.impact_perpetrator ?? "").toLowerCase().includes(q) ||
      (c.impact_school ?? "").toLowerCase().includes(q)
    );
  }, [categories, searchCategory, filterCategoryJenjang, tree]);

  // Levels
  const filteredLevels = useMemo(() => {
    if (!searchLevel.trim()) return [...levels].sort((a, b) => a.sort_order - b.sort_order);
    const q = searchLevel.toLowerCase();
    return levels.filter((l) => l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [levels, searchLevel]);

  // Guidelines
  const filteredGuidelines = useMemo(() => {
    let rows = guidelines;
    if (filterGuidelineCategory !== "__all__") {
      rows = rows.filter((g) => g.category_id === parseInt(filterGuidelineCategory));
    }
    if (filterGuidelineLevel !== "__all__") {
      rows = rows.filter((g) => g.level_id === parseInt(filterGuidelineLevel));
    }
    if (filterGuidelineTarget !== "__all__") {
      rows = rows.filter((g) => g.target_type === filterGuidelineTarget);
    }
    if (!searchGuideline.trim()) return rows;
    const q = searchGuideline.toLowerCase();
    return rows.filter((g) => g.guideline_text.toLowerCase().includes(q));
  }, [guidelines, searchGuideline, filterGuidelineCategory, filterGuidelineLevel, filterGuidelineTarget]);

  // Consequences
  const filteredConsequences = useMemo(() => {
    let rows = consequences;
    if (filterConsequenceCategory !== "__all__") {
      rows = rows.filter((c) => c.category_id === parseInt(filterConsequenceCategory));
    }
    if (filterConsequenceLevel !== "__all__") {
      rows = rows.filter((c) => c.level_id === parseInt(filterConsequenceLevel));
    }
    if (filterConsequenceType !== "__all__") {
      rows = rows.filter((c) => c.consequence_type === filterConsequenceType);
    }
    if (!searchConsequence.trim()) return rows;
    const q = searchConsequence.toLowerCase();
    return rows.filter((c) =>
      c.consequence_text.toLowerCase().includes(q) ||
      c.consequence_type.toLowerCase().includes(q)
    );
  }, [consequences, searchConsequence, filterConsequenceCategory, filterConsequenceLevel, filterConsequenceType]);

  // Documents
  const filteredDocuments = useMemo(() => {
    let rows = documents;
    if (filterDocumentCategory !== "__all__") {
      rows = rows.filter((d) => d.category_id === parseInt(filterDocumentCategory));
    }
    if (filterDocumentLevel !== "__all__") {
      rows = rows.filter((d) => d.level_id === parseInt(filterDocumentLevel));
    }
    if (!searchDocument.trim()) return rows;
    const q = searchDocument.toLowerCase();
    return rows.filter((d) =>
      d.document_name.toLowerCase().includes(q) ||
      (d.description ?? "").toLowerCase().includes(q)
    );
  }, [documents, searchDocument, filterDocumentCategory, filterDocumentLevel]);

  // ── Render ───────────────────────────────────────────────────────────────────

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
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Baca & cari semua struktur, SOP, sanksi, dan dokumen. Tidak dapat mengedit.
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
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
            <div className="flex items-center gap-2 flex-wrap">
              <SearchBar
                placeholder="Cari kategori, kelompok, perilaku, jenjang..."
                value={searchStructure}
                onChange={setSearchStructure}
                onClear={() => setSearchStructure("")}
              />
              {searchStructure && (
                <Badge variant="secondary" className="text-xs">
                  {filteredTree.reduce((s, n) => s + n.groups.reduce((g, grp) => g + grp.behaviors.length, 0), 0)} hasil
                </Badge>
              )}
            </div>

            {filteredTree.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Layers className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Tidak ada hasil untuk "{searchStructure}"</p>
              </div>
            ) : (
              filteredTree.map((node) => {
                const colors = CAT_COLORS[node.category.id] ?? {
                  border: "border-l-gray-400", bg: "bg-muted border border-border",
                  text: "text-foreground", dot: "bg-gray-400",
                  badge: "bg-muted text-muted-foreground", desc: "text-muted-foreground",
                };
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
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        <Badge variant="outline" className={`text-xs font-medium ${colors.badge}`}>
                          {node.groups.length} kelompok
                        </Badge>
                        <Badge variant="outline" className={`text-xs font-medium ${colors.badge}`}>
                          {totalBehaviors} perilaku
                        </Badge>
                      </div>
                    </div>

                    {/* Groups */}
                    {node.groups.length > 0 && (
                      <div className="border-t px-4 py-3 space-y-2">
                        {node.groups.map((grp) => {
                          const grpKey = `${node.category.id}-grp-${grp.group.id}`;
                          return (
                            <div key={grpKey} className="rounded-lg border overflow-hidden">
                              <button
                                className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/50 hover:bg-muted/80 transition-colors"
                                onClick={() => toggle(grpKey)}
                              >
                                <div className="flex items-center gap-2.5 text-left">
                                  <span className="text-sm font-medium">{grp.group.group_name}</span>
                                  <Badge variant="outline" className="text-xs font-medium">
                                    {grp.behaviors.length} butir
                                  </Badge>
                                </div>
                                {expanded.has(grpKey)
                                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                              </button>

                              {expanded.has(grpKey) && (
                                <div className="border-t">
                                  {grp.behaviors.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic px-4 py-3">Tidak ada butir perilaku.</p>
                                  ) : grp.behaviors.map((b) => (
                                    <div key={b.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50 text-sm border-b last:border-0">
                                      <span className="flex-1 leading-relaxed">{b.behavior_text}</span>
                                      <LevelBadge levels={b.levels} />
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
              })
            )}
          </TabsPrimitive.Panel>

          {/* ══════════════ KATEGORI ══════════════ */}
          <TabsPrimitive.Panel value="categories" className="p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <SearchBar
                placeholder="Cari nama/deskripsi kategori..."
                value={searchCategory}
                onChange={setSearchCategory}
                onClear={() => setSearchCategory("")}
              />
              <SelectFilter
                value={filterCategoryJenjang}
                onChange={setFilterCategoryJenjang}
                options={levels.map((l) => ({ value: String(l.id), label: l.code }))}
                placeholder="Jenjang"
              />
              {searchCategory && (
                <Badge variant="secondary" className="text-xs">{filteredCategories.length} hasil</Badge>
              )}
            </div>

            {filteredCategories.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Scale className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Tidak ada hasil</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredCategories.map((c) => {
                  const colors = CAT_COLORS[c.id] ?? {
                    border: "border-l-gray-400", bg: "bg-muted border border-border",
                    text: "text-foreground", dot: "bg-gray-400",
                    badge: "bg-muted text-muted-foreground", desc: "text-muted-foreground",
                  };
                  const node = tree.find((n) => n.category.id === c.id);
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
                          {c.general_description && (
                            <p className={`text-xs mb-2 ${colors.desc}`}>{c.general_description}</p>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <Badge className={`text-xs font-medium ${colors.badge}`}>{groupCount} kelompok</Badge>
                            <Badge className={`text-xs font-medium ${colors.badge}`}>{behaviorCount} perilaku</Badge>
                          </div>
                        </div>
                      </div>
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
            <div className="flex items-center gap-2 flex-wrap">
              <SearchBar
                placeholder="Cari kode atau nama jenjang..."
                value={searchLevel}
                onChange={setSearchLevel}
                onClear={() => setSearchLevel("")}
              />
              {searchLevel && (
                <Badge variant="secondary" className="text-xs">{filteredLevels.length} hasil</Badge>
              )}
            </div>

            {filteredLevels.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Tidak ada hasil</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {filteredLevels.map((l) => (
                  <Card key={l.id} className="p-4">
                    <span className="text-2xl font-bold font-mono text-primary">{l.code}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{l.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Urutan: {l.sort_order}</p>
                  </Card>
                ))}
              </div>
            )}
          </TabsPrimitive.Panel>

          {/* ══════════════ SOP ══════════════ */}
          <TabsPrimitive.Panel value="guidelines" className="p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <SearchBar
                placeholder="Cari isi SOP..."
                value={searchGuideline}
                onChange={setSearchGuideline}
                onClear={() => setSearchGuideline("")}
              />
              <SelectFilter
                value={filterGuidelineCategory}
                onChange={setFilterGuidelineCategory}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Kategori"
              />
              <SelectFilter
                value={filterGuidelineLevel}
                onChange={setFilterGuidelineLevel}
                options={levels.map((l) => ({ value: String(l.id), label: l.code }))}
                placeholder="Jenjang"
              />
              <SelectFilter
                value={filterGuidelineTarget}
                onChange={setFilterGuidelineTarget}
                options={targetTypes.map((t) => ({ value: t, label: t }))}
                placeholder="Tahap"
              />
              {(searchGuideline || filterGuidelineCategory !== "__all__" || filterGuidelineLevel !== "__all__" || filterGuidelineTarget !== "__all__") && (
                <Badge variant="secondary" className="text-xs">{filteredGuidelines.length} hasil</Badge>
              )}
            </div>

            {filteredGuidelines.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Tidak ada hasil</p>
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
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGuidelines.map((g, i) => (
                      <tr key={g.id} className={`border-b last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/15"}`}>
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{catName(g.category_id)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs font-mono font-bold">{levelCode(g.level_id)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="text-xs">{g.target_type}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className="text-xs bg-primary/15 text-primary border-0 font-bold">{g.step_number}</Badge>
                        </td>
                        <td className="px-4 py-3 max-w-md">
                          <p className="leading-relaxed">{g.guideline_text}</p>
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
            <div className="flex items-center gap-2 flex-wrap">
              <SearchBar
                placeholder="Cari sanksi..."
                value={searchConsequence}
                onChange={setSearchConsequence}
                onClear={() => setSearchConsequence("")}
              />
              <SelectFilter
                value={filterConsequenceCategory}
                onChange={setFilterConsequenceCategory}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Kategori"
              />
              <SelectFilter
                value={filterConsequenceLevel}
                onChange={setFilterConsequenceLevel}
                options={levels.map((l) => ({ value: String(l.id), label: l.code }))}
                placeholder="Jenjang"
              />
              <SelectFilter
                value={filterConsequenceType}
                onChange={setFilterConsequenceType}
                options={consequenceTypes.map((t) => ({ value: t, label: t }))}
                placeholder="Jenis Sanksi"
              />
              {(searchConsequence || filterConsequenceCategory !== "__all__" || filterConsequenceLevel !== "__all__" || filterConsequenceType !== "__all__") && (
                <Badge variant="secondary" className="text-xs">{filteredConsequences.length} hasil</Badge>
              )}
            </div>

            {filteredConsequences.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Tidak ada hasil</p>
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
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConsequences.map((c, i) => (
                      <tr key={c.id} className={`border-b last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/15"}`}>
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{catName(c.category_id)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs font-mono font-bold">{levelCode(c.level_id)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs font-medium ${CONSEQUENCE_BADGE[c.consequence_type] ?? "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}>
                            {c.consequence_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 max-w-md">
                          <p className="leading-relaxed">{c.consequence_text}</p>
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
            <div className="flex items-center gap-2 flex-wrap">
              <SearchBar
                placeholder="Cari nama dokumen..."
                value={searchDocument}
                onChange={setSearchDocument}
                onClear={() => setSearchDocument("")}
              />
              <SelectFilter
                value={filterDocumentCategory}
                onChange={setFilterDocumentCategory}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Kategori"
              />
              <SelectFilter
                value={filterDocumentLevel}
                onChange={setFilterDocumentLevel}
                options={levels.map((l) => ({ value: String(l.id), label: l.code }))}
                placeholder="Jenjang"
              />
              {(searchDocument || filterDocumentCategory !== "__all__" || filterDocumentLevel !== "__all__") && (
                <Badge variant="secondary" className="text-xs">{filteredDocuments.length} hasil</Badge>
              )}
            </div>

            {filteredDocuments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Tidak ada hasil</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 border-b">
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-10">#</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Kategori</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Jenjang</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Nama Dokumen</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Deskripsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((d, i) => (
                      <tr key={d.id} className={`border-b last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/15"}`}>
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{catName(d.category_id)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs font-mono font-bold">{levelCode(d.level_id)}</Badge>
                        </td>
                        <td className="px-4 py-3">{d.document_name}</td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="text-muted-foreground text-xs">{d.description ?? "—"}</p>
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
    </div>
  );
}