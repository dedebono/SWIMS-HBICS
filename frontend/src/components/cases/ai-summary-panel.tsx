'use client';

import { useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Bot,
  Check,
  ClipboardCheck,
  HeartHandshake,
  Lightbulb,
  Loader2,
  MessageCircle,
  PhoneCall,
  Scale,
  Sparkles,
  ClipboardCopy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

/* ─── Tipe respons POST /cases/:caseId/insights/generate ─────────────────── */

export interface AiSummarySections {
  terjadi?: string;
  sudah_dilakukan?: string;
  komunikasi?: string;
  posisi?: string;
  saran?: string;
}

export interface AiSummaryReference {
  category_id: number | null;
  category_name: string | null;
  level_id: number | null;
  level_name: string | null;
  sop: Array<{ target_type: string; step_number: number; text: string }>;
  sanksi: Array<{ consequence_type: string; items: string[] }>;
}

export interface AiSummaryStats {
  incidents: number;
  interventions_done: number;
  interventions_total: number;
  communications: number;
  observations: number;
  days_open: number | null;
}

export interface AiInsight {
  summary: string;
  sections?: AiSummarySections;
  reference?: AiSummaryReference;
  stats?: AiSummaryStats;
}

/* ─── Tampilan ──────────────────────────────────────────────────────────── */

const SECTION_CARDS: Array<{
  key: keyof AiSummarySections;
  title: string;
  hint: string;
  icon: typeof AlertCircle;
  wrap: string;
  head: string;
}> = [
  {
    key: 'terjadi',
    title: 'Apa yang Terjadi',
    hint: 'Ringkasan singkat kejadiannya.',
    icon: AlertCircle,
    wrap: 'border-danger-soft bg-danger-soft',
    head: 'text-danger',
  },
  {
    key: 'sudah_dilakukan',
    title: 'Yang Sudah Dilakukan',
    hint: 'Tindakan guru dan sekolah sejauh ini.',
    icon: Check,
    wrap: 'border-success-soft bg-success-soft',
    head: 'text-success',
  },
  {
    key: 'komunikasi',
    title: 'Komunikasi dengan Orang Tua',
    hint: 'Sudah berapa kali dan lewat apa.',
    icon: PhoneCall,
    wrap: 'border-info-soft bg-info-soft',
    head: 'text-info',
  },
  {
    key: 'posisi',
    title: 'Sudah Sampai Mana',
    hint: 'Posisi kasus sekarang dan yang belum selesai.',
    icon: ClipboardCheck,
    wrap: 'border-primary-soft bg-primary-softer',
    head: 'text-primary',
  },
];

function bullets(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean);
}

function stripMarkers(summary: string): string {
  return summary.replace('[AI-GENERATED SUMMARY]', '').trim();
}

/** Fallback untuk ringkasan lama yang disimpan sebelum fitur ini ada. */
function LegacySummary({ summary }: { summary: string }) {
  const clean = stripMarkers(summary);
  const paragraphs = clean.split(/\n{2,}/).filter((p) => p.trim() !== '');
  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => (
        <div
          key={i}
          className={`rounded-xl border p-3.5 ${
            i === 0 ? 'border-danger-soft bg-danger-soft' : 'border-success-soft bg-success-soft'
          }`}
        >
          <h4
            className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${
              i === 0 ? 'text-danger' : 'text-success'
            }`}
          >
            {i === 0 ? <AlertCircle className="size-3.5" /> : <HeartHandshake className="size-3.5" />}
            {i === 0 ? 'Apa yang Terjadi' : 'Bagaimana Penanganannya'}
          </h4>
          <p className="whitespace-pre-wrap text-sm text-secondary-text">
            {p.replace(/^(1\.|2\.|Apa yang terjadi:?|Bagaimana penanganannya:?|-|--)/i, '').trim()}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AiSummaryPanel({
  summary,
  insight,
  onRegenerate,
  isGenerating,
  onSave,
  isSaving,
}: {
  summary: string;
  insight?: AiInsight | null;
  onRegenerate?: () => void;
  isGenerating: boolean;
  onSave?: (summary: string) => void;
  isSaving?: boolean;
}) {
  const [showRef, setShowRef] = useState(false);

  const sections = insight?.sections;
  const reference = insight?.reference;
  const stats = insight?.stats;
  const hasSections = Boolean(sections && Object.values(sections).some((v) => v && v.trim()));
  const adviceList = sections?.saran ? bullets(sections.saran) : [];

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} disalin.`);
    } catch {
      toast.error('Gagal menyalin. Salin manual ya, Bos.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Ringkasan inti — satu kalimat paling penting untuk guru & orang tua */}
      {sections?.terjadi ? (
        <div className="rounded-xl border border-primary-soft bg-gradient-to-br from-primary-softer to-card p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              Ringkasan Singkat
            </span>
            {stats ? (
              <span className="text-xs text-muted-foreground">
                {stats.incidents} insiden · {stats.interventions_done}/{stats.interventions_total} intervensi ·{' '}
                {stats.communications} komunikasi
                {stats.days_open !== null ? ` · berjalan ${stats.days_open} hari` : ''}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => copyText('Ringkasan', stripMarkers(insight?.summary ?? summary))}
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              <ClipboardCopy className="size-3.5" /> Salin
            </button>
          </div>
          <p className="text-[15px] leading-relaxed text-heading">{stripMarkers(sections.terjadi)}</p>
        </div>
      ) : null}

      {/* Bagian per topik */}
      {hasSections ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTION_CARDS.filter((c) => c.key !== 'terjadi').map((card) => {
            const value = sections?.[card.key];
            if (!value || !value.trim()) return null;
            const Icon = card.icon;
            return (
              <div key={card.key} className={`rounded-xl border p-3.5 ${card.wrap}`}>
                <h4 className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${card.head}`}>
                  <Icon className="size-3.5" />
                  {card.title}
                </h4>
                <p className="text-sm leading-relaxed text-secondary-text">{value.trim()}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{card.hint}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Saran untuk guru — hasil bacaan AI atas SOP + SANKSI Buku Pedoman Disiplin */}
      {adviceList.length > 0 ? (
        <div className="rounded-xl border border-warning-soft bg-warning-soft p-4">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <Lightbulb className="size-4 text-warning" />
            <span className="text-xs font-semibold uppercase tracking-wide text-warning">
              Saran untuk Guru
            </span>
            {reference?.category_name ? (
              <Badge variant="outline" className="text-[11px]">
                {reference.category_name}
                {reference.level_name ? ` · ${reference.level_name}` : ''}
              </Badge>
            ) : null}
          </div>
          <ul className="space-y-2">
            {adviceList.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-secondary-text">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-warning/15 text-[11px] font-semibold text-warning">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => copyText('Saran', adviceList.join('\n'))}>
              <ClipboardCopy className="size-3.5" /> Salin saran
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowRef((v) => !v)}>
              <BookOpen className="size-3.5" />
              {showRef ? 'Tutup acuan' : 'Lihat acuan Buku Pedoman Disiplin'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Acuan: SOP + SANKSI yang dipakai AI */}
      {showRef && reference ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-heading">
              Acuan: {reference.category_name ?? 'Buku Pedoman Disiplin'}
              {reference.level_name ? ` — ${reference.level_name}` : ''}
            </span>
          </div>

          {reference.sop.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">SOP PENANGANAN</p>
              <ul className="space-y-1.5">
                {reference.sop.map((step, i) => (
                  <li key={i} className="text-sm leading-relaxed text-secondary-text">
                    <span className="mr-1.5 rounded bg-primary-softer px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      {step.target_type} {step.step_number}
                    </span>
                    {step.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {reference.sanksi.length > 0 ? (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Scale className="size-3.5" /> SANKSI / KONSEKUENSI
              </p>
              <div className="space-y-2">
                {reference.sanksi.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border bg-muted/30 p-2.5">
                    <p className="text-xs font-semibold text-heading">{s.consequence_type}</p>
                    <ul className="mt-1 space-y-0.5">
                      {s.items.map((item, j) => (
                        <li key={j} className="text-sm text-secondary-text">
                          · {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!reference.sop.length && !reference.sanksi.length ? (
            <p className="text-sm text-muted-foreground">
              Belum ada isian Buku Pedoman Disiplin untuk jenjang ini. Isi dulu di menu{' '}
              <span className="font-medium">Buku Pedoman Disiplin</span> supaya sarannya lebih tepat.
            </p>
          ) : null}
        </div>
      ) : null}

      {!hasSections ? <LegacySummary summary={summary} /> : null}

      {/* Teks mentah — tetap tersedia untuk laporan */}
      {hasSections ? (
        <details className="rounded-xl border border-border bg-muted/20 p-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Lihat teks lengkap (untuk laporan)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-secondary-text">
            {stripMarkers(insight?.summary ?? summary)}
          </pre>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Bot className="size-3.5" />
          Dibuat AI dari insiden, intervensi, dan log komunikasi. Cek dulu sebelum dipakai.
        </p>
        <div className="flex gap-2">
          {onSave ? (
            <Button size="sm" onClick={() => onSave(stripMarkers(insight?.summary ?? summary))} disabled={isSaving}>
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <ClipboardCheck className="size-3.5" />}
              Simpan ke kasus
            </Button>
          ) : null}
          {onRegenerate ? (
            <Button variant="outline" size="sm" onClick={onRegenerate} disabled={isGenerating}>
              {isGenerating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <MessageCircle className="size-3.5" />
              )}
              Buat ulang
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}