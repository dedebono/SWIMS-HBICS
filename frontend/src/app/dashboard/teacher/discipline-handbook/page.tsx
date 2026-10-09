"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookOpen, RefreshCw, ChevronDown, ChevronRight,
  Layers, Scale, GraduationCap, FileText, AlertTriangle, FolderOpen, Search, X, Info,
  UserRound, TriangleAlert, School,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { IconBox, type IconTone } from "@/components/ui/icon-box";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/data-table";

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

/** Category accents: pastel tint + semantic tones (light mode only). */
const CAT_STYLE: Record<number, { tone: IconTone; badge: StatusTone; surface: string; accent: string }> = {
  1: { tone: "green", badge: "success", surface: "bg-success-soft/40 border-success-soft", accent: "bg-success" },
  2: { tone: "yellow", badge: "warning", surface: "bg-warning-soft/40 border-warning-soft", accent: "bg-warning" },
  3: { tone: "teal", badge: "info", surface: "bg-info-soft/40 border-info-soft", accent: "bg-primary" },
  4: { tone: "red", badge: "danger", surface: "bg-danger-soft/40 border-danger-soft", accent: "bg-danger" },
};

const DEFAULT_CAT_STYLE = {
  tone: "slate" as IconTone,
  badge: "neutral" as StatusTone,
  surface: "bg-card border-border",
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

function catStyle(id: number) {
  return CAT_STYLE[id] ?? DEFAULT_CAT_STYLE;
}

// ─── Search/Filter Bar ─────────────────────────────────────────────────────────

function SearchBar({
  placeholder,
  value,
  onChange,
  onClear,
  label,
}: {
  placeholder: string; value: string; onChange: (v: string) => void; onClear?: () => void; label: string;
}) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 pr-9"
      />
      {value && (
        <button
          type="button"
          aria-label="Bersihkan pencarian"
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-heading"
        >
          <X className="size-3.5" />
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
  label,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder: string; label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger aria-label={label} className="w-full sm:w-auto sm:min-w-[130px]">
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

/** Compact result counter chip rendered next to the filters. */
function ResultCount({ count }: { count: number }) {
  return (
    <StatusBadge tone="info" dot={false} label={`${count} hasil`} />
  );
}

// ─── Level Badge ───────────────────────────────────────────────────────────────

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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TeacherDisciplineHandbookPage() {
  const [loading, setLoading] = useState(true);

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

  const catName = (id: number) => categories.find((c) => c.id === id)?.name ?? `Kategori ${id}`;
  const levelCode = (id: number) => levels.find((l) => l.id === id)?.code ?? "—";

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

  // ── Statistics ───────────────────────────────────────────────────────────────

  const totalGroups = tree.reduce((s, n) => s + n.groups.length, 0);
  const totalBehaviors = tree.reduce((s, n) => s + n.groups.reduce((x, g) => x + g.behaviors.length, 0), 0);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Buku Pedoman Disiplin"
          description="Baca dan cari seluruh struktur, SOP, sanksi, serta dokumen pedoman disiplin sekolah."
        />
        <div className="flex h-64 items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <PageHeader
        title="Buku Pedoman Disiplin"
        description="Baca dan cari seluruh struktur, SOP, sanksi, serta dokumen pedoman disiplin sekolah."
        actions={
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="size-4" />
            Muat Ulang
          </Button>
        }
      />

      {/* ── Ringkasan ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Kategori Pelanggaran"
          value={categories.length}
          hint="Tingkatan pelanggaran yang diatur sekolah"
          icon={<Scale className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Kelompok Perilaku"
          value={totalGroups}
          hint="Grup perilaku di seluruh kategori"
          icon={<Layers className="size-5" />}
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
          label="Referensi Pedoman"
          value={guidelines.length + consequences.length + documents.length}
          hint={`${guidelines.length} SOP · ${consequences.length} sanksi · ${documents.length} dokumen`}
          icon={<BookOpen className="size-5" />}
          iconTone="green"
        />
      </div>

      {/* ── Catatan ── */}
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-info-soft/40 p-4">
        <IconBox tone="blue" size="sm">
          <Info />
        </IconBox>
        <p className="text-sm leading-relaxed text-secondary-text">
          Halaman ini bersifat baca saja. Struktur, SOP penanganan, sanksi, dan dokumen disusun oleh Admin
          melalui Buku Pedoman Disiplin. Gunakan pencarian dan filter untuk menemukan materi yang Anda butuhkan.
        </p>
      </div>

      {/* ── Tab Navigation ── */}
      <Card>
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
              <div className="flex flex-wrap items-center gap-2.5">
                <SearchBar
                  label="Cari struktur perilaku"
                  placeholder="Cari kategori, kelompok, perilaku, jenjang…"
                  value={searchStructure}
                  onChange={setSearchStructure}
                  onClear={() => setSearchStructure("")}
                />
                {searchStructure && (
                  <ResultCount
                    count={filteredTree.reduce((s, n) => s + n.groups.reduce((g, grp) => g + grp.behaviors.length, 0), 0)}
                  />
                )}
              </div>

              {filteredTree.length === 0 ? (
                <EmptyState
                  icon={<Layers />}
                  title="Tidak ada hasil"
                  description={`Tidak ada struktur perilaku yang cocok dengan "${searchStructure}". Coba kata kunci lain.`}
                />
              ) : (
                <div className="space-y-4">
                  {filteredTree.map((node) => {
                    const style = catStyle(node.category.id);
                    const totalBehaviorsInCat = node.groups.reduce((s, g) => s + g.behaviors.length, 0);
                    return (
                      <div key={node.category.id} className={`overflow-hidden rounded-xl border ${style.surface}`}>
                        {/* Category header */}
                        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className={`size-2.5 shrink-0 rounded-full ${style.accent}`} />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-heading">{node.category.name}</p>
                              {node.category.general_description && (
                                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                  {node.category.general_description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                            <StatusBadge tone={style.badge} dot={false} label={`${node.groups.length} kelompok`} />
                            <StatusBadge tone="neutral" dot={false} label={`${totalBehaviorsInCat} perilaku`} />
                          </div>
                        </div>

                        {/* Groups */}
                        {node.groups.length > 0 ? (
                          <div className="space-y-2 border-t border-border/60 px-4 py-3">
                            {node.groups.map((grp) => {
                              const grpKey = `${node.category.id}-grp-${grp.group.id}`;
                              return (
                                <div key={grpKey} className="overflow-hidden rounded-xl border border-border bg-card">
                                  <button
                                    type="button"
                                    aria-expanded={expanded.has(grpKey)}
                                    className="flex w-full items-center justify-between gap-3 bg-muted/50 px-4 py-2.5 text-left transition-colors hover:bg-muted/80"
                                    onClick={() => toggle(grpKey)}
                                  >
                                    <div className="flex min-w-0 items-center gap-2.5">
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
                                    </div>
                                  </button>

                                  {expanded.has(grpKey) && (
                                    <div className="border-t border-border">
                                      {grp.behaviors.length === 0 ? (
                                        <p className="px-4 py-3 text-sm text-muted-foreground">
                                          Belum ada butir perilaku pada kelompok ini.
                                        </p>
                                      ) : (
                                        grp.behaviors.map((b) => (
                                          <div
                                            key={b.id}
                                            className="flex flex-col gap-2.5 border-b border-border px-4 py-3 text-sm last:border-0 lg:flex-row lg:items-start lg:gap-4"
                                          >
                                            <p className="flex-1 leading-relaxed text-secondary-text">
                                              {b.behavior_text}
                                            </p>
                                            <div className="shrink-0">
                                              <LevelBadge levels={b.levels} />
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="border-t border-border/60 px-4 py-3">
                            <p className="text-xs text-muted-foreground">Belum ada kelompok perilaku</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ══════════════ KATEGORI ══════════════ */}
            <TabsContent value="categories" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <SearchBar
                  label="Cari kategori"
                  placeholder="Cari nama atau deskripsi kategori…"
                  value={searchCategory}
                  onChange={setSearchCategory}
                  onClear={() => setSearchCategory("")}
                />
                <SelectFilter
                  label="Filter jenjang"
                  value={filterCategoryJenjang}
                  onChange={setFilterCategoryJenjang}
                  options={levels.map((l) => ({ value: String(l.id), label: l.code }))}
                  placeholder="Jenjang"
                />
                {searchCategory && <ResultCount count={filteredCategories.length} />}
              </div>

              {filteredCategories.length === 0 ? (
                <EmptyState
                  icon={<Scale />}
                  title="Tidak ada hasil"
                  description="Tidak ada kategori yang cocok dengan pencarian atau filter Anda."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredCategories.map((c) => {
                    const style = catStyle(c.id);
                    const node = tree.find((n) => n.category.id === c.id);
                    const groupCount = node?.groups.length ?? 0;
                    const behaviorCount = node?.groups.reduce((s, g) => s + g.behaviors.length, 0) ?? 0;
                    return (
                      <div key={c.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className={`size-2 shrink-0 rounded-full ${style.accent}`} />
                              <span className="text-sm font-semibold text-heading">{c.name}</span>
                              <StatusBadge tone="neutral" dot={false} label={`#${c.id}`} />
                            </div>
                            {c.general_description && (
                              <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                                {c.general_description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge tone={style.badge} dot={false} label={`${groupCount} kelompok`} />
                              <StatusBadge tone="neutral" dot={false} label={`${behaviorCount} perilaku`} />
                            </div>
                          </div>
                        </div>

                        {(c.impact_victim || c.impact_perpetrator || c.impact_school) && (
                          <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                            {c.impact_victim && (
                              <div className="flex items-start gap-2">
                                <IconBox tone="red" size="sm" className="size-6 rounded-md">
                                  <UserRound className="size-3" />
                                </IconBox>
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                  <span className="font-medium text-secondary-text">Korban: </span>
                                  {c.impact_victim}
                                </p>
                              </div>
                            )}
                            {c.impact_perpetrator && (
                              <div className="flex items-start gap-2">
                                <IconBox tone="yellow" size="sm" className="size-6 rounded-md">
                                  <TriangleAlert className="size-3" />
                                </IconBox>
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                  <span className="font-medium text-secondary-text">Pelaku: </span>
                                  {c.impact_perpetrator}
                                </p>
                              </div>
                            )}
                            {c.impact_school && (
                              <div className="flex items-start gap-2">
                                <IconBox tone="blue" size="sm" className="size-6 rounded-md">
                                  <School className="size-3" />
                                </IconBox>
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                  <span className="font-medium text-secondary-text">Sekolah: </span>
                                  {c.impact_school}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ══════════════ JENJANG ══════════════ */}
            <TabsContent value="levels" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <SearchBar
                  label="Cari jenjang"
                  placeholder="Cari kode atau nama jenjang…"
                  value={searchLevel}
                  onChange={setSearchLevel}
                  onClear={() => setSearchLevel("")}
                />
                {searchLevel && <ResultCount count={filteredLevels.length} />}
              </div>

              {filteredLevels.length === 0 ? (
                <EmptyState
                  icon={<GraduationCap />}
                  title="Tidak ada hasil"
                  description="Tidak ada jenjang pendidikan yang cocok dengan pencarian Anda."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {filteredLevels.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
                    >
                      <IconBox tone="blue" size="sm" className="mt-0.5">
                        <GraduationCap className="size-4" />
                      </IconBox>
                      <div className="min-w-0">
                        <p className="font-heading text-xl font-bold tracking-tight text-heading">{l.code}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{l.name}</p>
                        <p className="mt-1.5">
                          <StatusBadge tone="neutral" dot={false} label={`Urutan ${l.sort_order}`} />
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ══════════════ SOP ══════════════ */}
            <TabsContent value="guidelines" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <SearchBar
                  label="Cari SOP"
                  placeholder="Cari isi SOP…"
                  value={searchGuideline}
                  onChange={setSearchGuideline}
                  onClear={() => setSearchGuideline("")}
                />
                <SelectFilter
                  label="Filter kategori SOP"
                  value={filterGuidelineCategory}
                  onChange={setFilterGuidelineCategory}
                  options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                  placeholder="Kategori"
                />
                <SelectFilter
                  label="Filter jenjang SOP"
                  value={filterGuidelineLevel}
                  onChange={setFilterGuidelineLevel}
                  options={levels.map((l) => ({ value: String(l.id), label: l.code }))}
                  placeholder="Jenjang"
                />
                <SelectFilter
                  label="Filter tahap SOP"
                  value={filterGuidelineTarget}
                  onChange={setFilterGuidelineTarget}
                  options={targetTypes.map((t) => ({ value: t, label: t }))}
                  placeholder="Tahap"
                />
                {(searchGuideline || filterGuidelineCategory !== "__all__" || filterGuidelineLevel !== "__all__" || filterGuidelineTarget !== "__all__") && (
                  <ResultCount count={filteredGuidelines.length} />
                )}
              </div>

              {filteredGuidelines.length === 0 ? (
                <EmptyState
                  icon={<FileText />}
                  title="Tidak ada hasil"
                  description="Tidak ada SOP yang cocok dengan pencarian atau filter Anda."
                />
              ) : (
                <DataTable>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell scope="col" className="w-10">#</TableHeaderCell>
                      <TableHeaderCell scope="col">Kategori</TableHeaderCell>
                      <TableHeaderCell scope="col">Jenjang</TableHeaderCell>
                      <TableHeaderCell scope="col">Tahap</TableHeaderCell>
                      <TableHeaderCell scope="col" className="w-14 text-center">Langkah</TableHeaderCell>
                      <TableHeaderCell scope="col">Isi SOP</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredGuidelines.map((g, i) => (
                      <TableRow key={g.id} interactive>
                        <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                        <TableCell className="font-medium text-heading">{catName(g.category_id)}</TableCell>
                        <TableCell>
                          <StatusBadge tone="neutral" dot={false} label={levelCode(g.level_id)} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone="info" dot={false} label={g.target_type} />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge tone="purple" dot={false} label={`${g.step_number}`} />
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="leading-relaxed text-secondary-text">{g.guideline_text}</p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}
            </TabsContent>

            {/* ══════════════ SANKSI ══════════════ */}
            <TabsContent value="consequences" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <SearchBar
                  label="Cari sanksi"
                  placeholder="Cari jenis atau detail sanksi…"
                  value={searchConsequence}
                  onChange={setSearchConsequence}
                  onClear={() => setSearchConsequence("")}
                />
                <SelectFilter
                  label="Filter kategori sanksi"
                  value={filterConsequenceCategory}
                  onChange={setFilterConsequenceCategory}
                  options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                  placeholder="Kategori"
                />
                <SelectFilter
                  label="Filter jenjang sanksi"
                  value={filterConsequenceLevel}
                  onChange={setFilterConsequenceLevel}
                  options={levels.map((l) => ({ value: String(l.id), label: l.code }))}
                  placeholder="Jenjang"
                />
                <SelectFilter
                  label="Filter jenis sanksi"
                  value={filterConsequenceType}
                  onChange={setFilterConsequenceType}
                  options={consequenceTypes.map((t) => ({ value: t, label: t }))}
                  placeholder="Jenis Sanksi"
                />
                {(searchConsequence || filterConsequenceCategory !== "__all__" || filterConsequenceLevel !== "__all__" || filterConsequenceType !== "__all__") && (
                  <ResultCount count={filteredConsequences.length} />
                )}
              </div>

              {filteredConsequences.length === 0 ? (
                <EmptyState
                  icon={<AlertTriangle />}
                  title="Tidak ada hasil"
                  description="Tidak ada sanksi yang cocok dengan pencarian atau filter Anda."
                />
              ) : (
                <DataTable>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell scope="col" className="w-10">#</TableHeaderCell>
                      <TableHeaderCell scope="col">Kategori</TableHeaderCell>
                      <TableHeaderCell scope="col">Jenjang</TableHeaderCell>
                      <TableHeaderCell scope="col">Jenis Sanksi</TableHeaderCell>
                      <TableHeaderCell scope="col">Detail Sanksi</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredConsequences.map((c, i) => (
                      <TableRow key={c.id} interactive>
                        <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
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
                        <TableCell className="max-w-md">
                          <p className="leading-relaxed text-secondary-text">{c.consequence_text}</p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}
            </TabsContent>

            {/* ══════════════ DOKUMEN ══════════════ */}
            <TabsContent value="documents" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <SearchBar
                  label="Cari dokumen"
                  placeholder="Cari nama atau deskripsi dokumen…"
                  value={searchDocument}
                  onChange={setSearchDocument}
                  onClear={() => setSearchDocument("")}
                />
                <SelectFilter
                  label="Filter kategori dokumen"
                  value={filterDocumentCategory}
                  onChange={setFilterDocumentCategory}
                  options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                  placeholder="Kategori"
                />
                <SelectFilter
                  label="Filter jenjang dokumen"
                  value={filterDocumentLevel}
                  onChange={setFilterDocumentLevel}
                  options={levels.map((l) => ({ value: String(l.id), label: l.code }))}
                  placeholder="Jenjang"
                />
                {(searchDocument || filterDocumentCategory !== "__all__" || filterDocumentLevel !== "__all__") && (
                  <ResultCount count={filteredDocuments.length} />
                )}
              </div>

              {filteredDocuments.length === 0 ? (
                <EmptyState
                  icon={<FolderOpen />}
                  title="Tidak ada hasil"
                  description="Tidak ada dokumen yang cocok dengan pencarian atau filter Anda."
                />
              ) : (
                <DataTable>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell scope="col" className="w-10">#</TableHeaderCell>
                      <TableHeaderCell scope="col">Kategori</TableHeaderCell>
                      <TableHeaderCell scope="col">Jenjang</TableHeaderCell>
                      <TableHeaderCell scope="col">Nama Dokumen</TableHeaderCell>
                      <TableHeaderCell scope="col">Deskripsi</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredDocuments.map((d, i) => (
                      <TableRow key={d.id} interactive>
                        <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                        <TableCell className="font-medium text-heading">{catName(d.category_id)}</TableCell>
                        <TableCell>
                          <StatusBadge tone="neutral" dot={false} label={levelCode(d.level_id)} />
                        </TableCell>
                        <TableCell className="font-medium text-heading">{d.document_name}</TableCell>
                        <TableCell className="max-w-xs text-xs text-muted-foreground">
                          {d.description ?? "—"}
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
    </div>
  );
}