'use client';

import React from 'react';
import {
  AlertTriangle,
  Check,
  ListChecks,
  MessageSquareText,
  SlidersHorizontal,
  Stethoscope,
  Star,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IconBox } from '@/components/ui/icon-box';
import { ProgressPill, StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

export interface StaffQuestion {
  question_id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'checkbox' | 'text' | 'rating';
  is_required: boolean;
  order_index: number;
}

export interface StaffAnswer {
  answer_id: string;
  question_id: string;
  answer_text: string;
  score: number;
}

export type StaffAnswers = Record<string, { answer_text?: string; score: number }>;

interface Props {
  questions: StaffQuestion[];
  answersMap: Record<string, StaffAnswer[]>;
  answers: StaffAnswers;
  onAnswerChange: (qid: string, value: { answer_text?: string; score: number }) => void;
  threshold: number;
  totalScore: number;
  recommendation: 'professional' | 'internal';
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

const TYPE_META: Record<
  StaffQuestion['question_type'],
  { icon: React.ReactNode; label: string; tone: "blue" | "green" | "red" | "yellow" | "purple" | "teal" | "pink" | "slate" }
> = {
  multiple_choice: { icon: <Check className="size-4" />, label: 'Pilihan Tunggal', tone: 'blue' },
  checkbox: { icon: <ListChecks className="size-4" />, label: 'Pilihan Ganda', tone: 'purple' },
  text: { icon: <MessageSquareText className="size-4" />, label: 'Uraian', tone: 'slate' },
  rating: { icon: <Star className="size-4" />, label: 'Skala Penilaian', tone: 'yellow' },
};

export function QuisionerForm({
  questions,
  answersMap,
  answers,
  onAnswerChange,
  threshold,
  totalScore,
  recommendation,
  submitting,
  onSubmit,
}: Props) {
  const thresholdPct =
    threshold > 0 ? Math.min(100, Math.round((totalScore / threshold) * 100)) : 0;
  const isProfessional = recommendation === 'professional';

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Ringkasan skor — titik masuk visual untuk skala penilaian */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Skor"
          value={totalScore}
          hint="Akumulasi jawaban yang telah dipilih"
          icon={<SlidersHorizontal className="size-5" />}
          iconTone="blue"
        />
        <StatCard
          label="Ambang Batas"
          value={threshold}
          hint="Batas minimum untuk rujukan profesional"
          icon={<Star className="size-5" />}
          iconTone="yellow"
          progress={thresholdPct}
          progressLabel="Progres menuju ambang batas"
        />
        <StatCard
          label="Rekomendasi"
          value={
            <span className="text-lg">{isProfessional ? 'Profesional' : 'Internal'}</span>
          }
          hint={
            isProfessional
              ? 'Hasil necessitate pendampingan psikolog profesional'
              : 'Pendampingan internal sekolah sudah memadai'
          }
          icon={<Stethoscope className="size-5" />}
          iconTone={isProfessional ? 'red' : 'green'}
        />
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle>Skala Penilaian Anda</CardTitle>
              <CardDescription>
                Skor berjalan diperbarui otomatis setiap kali Anda memilih jawaban.
              </CardDescription>
            </div>
            <StatusBadge
              tone={isProfessional ? 'danger' : 'success'}
              label={isProfessional ? 'Rekomendasi: Profesional' : 'Rekomendasi: Internal'}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Total skor <span className="font-heading text-lg font-semibold text-heading">{totalScore}</span>
              <span className="text-muted-foreground"> dari ambang batas </span>
              <span className="font-heading text-lg font-semibold text-heading">{threshold}</span>
            </p>
            <span className="text-xs font-semibold text-muted-foreground">{thresholdPct}%</span>
          </div>
          <ProgressPill
            value={thresholdPct}
            tone={isProfessional ? 'red' : 'green'}
            label="Progres skor menuju ambang batas"
          />
        </CardContent>
      </Card>

      {questions.map((q, i) => {
        const qAnswers = answersMap[q.question_id] || [];
        const current = answers[q.question_id];
        const meta = TYPE_META[q.question_type];
        const maxScore = qAnswers.reduce((max, a) => Math.max(max, a.score), 0);

        return (
          <Card key={q.question_id}>
            <CardHeader>
              <div className="flex items-start gap-3">
                <IconBox tone={meta.tone} size="sm">
                  {meta.icon}
                </IconBox>
                <div className="min-w-0 flex-1 space-y-1">
                  <CardTitle>
                    {i + 1}. {q.question_text}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{meta.label}</span>
                    {q.is_required ? (
                      <StatusBadge tone="info" label="Wajib diisi" />
                    ) : (
                      <StatusBadge tone="neutral" label="Opsional" />
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {q.question_type === 'text' && (
                <div className="space-y-2">
                  <Label htmlFor={`q-${q.question_id}`}>Jawaban Anda</Label>
                  <Textarea
                    id={`q-${q.question_id}`}
                    value={current?.answer_text || ''}
                    onChange={(e) => onAnswerChange(q.question_id, { answer_text: e.target.value, score: 0 })}
                    placeholder="Tuliskan jawaban Anda…"
                    rows={3}
                  />
                </div>
              )}

              {q.question_type === 'multiple_choice' && (
                <div className="grid gap-2">
                  {qAnswers.map((a) => {
                    const checked = current?.answer_text === a.answer_text;
                    return (
                      <label
                        key={a.answer_id}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors',
                          checked
                            ? 'border-primary bg-primary-softer'
                            : 'border-border bg-card hover:bg-muted'
                        )}
                      >
                        <input
                          type="radio"
                          name={q.question_id}
                          checked={checked}
                          onChange={() => onAnswerChange(q.question_id, { answer_text: a.answer_text, score: a.score })}
                          className="size-4 accent-primary"
                        />
                        <span className="flex-1 text-sm text-heading">{a.answer_text}</span>
                        <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
                          Skor {a.score}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {q.question_type === 'checkbox' && (
                <div className="grid gap-2">
                  {qAnswers.map((a) => {
                    const selected = (current?.answer_text || '').split('|').filter(Boolean);
                    const checked = selected.includes(a.answer_text);
                    return (
                      <label
                        key={a.answer_id}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors',
                          checked
                            ? 'border-primary bg-primary-softer'
                            : 'border-border bg-card hover:bg-muted'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selected, a.answer_text]
                              : selected.filter((x) => x !== a.answer_text);
                            const score = next.reduce(
                              (s, t) => s + (qAnswers.find((x) => x.answer_text === t)?.score || 0),
                              0,
                            );
                            onAnswerChange(q.question_id, { answer_text: next.join('|'), score });
                          }}
                          className="size-4 accent-primary"
                        />
                        <span className="flex-1 text-sm text-heading">{a.answer_text}</span>
                        <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
                          Skor {a.score}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {q.question_type === 'rating' && (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {qAnswers.map((a) => {
                      const checked = current?.answer_text === a.answer_text;
                      return (
                        <label
                          key={a.answer_id}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors',
                            checked
                              ? 'border-primary bg-primary-softer'
                              : 'border-border bg-card hover:bg-muted'
                          )}
                        >
                          <input
                            type="radio"
                            name={q.question_id}
                            checked={checked}
                            onChange={() => onAnswerChange(q.question_id, { answer_text: a.answer_text, score: a.score })}
                            className="size-4 accent-primary"
                          />
                          <span className="flex-1 text-sm text-heading">{a.answer_text}</span>
                          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
                            {a.score}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {maxScore > 0 ? (
                    <div className="rounded-xl border border-border bg-background p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Skor skala pertanyaan ini</span>
                        <span className="text-xs font-semibold text-heading">
                          {current?.score ?? 0} / {maxScore}
                        </span>
                      </div>
                      <ProgressPill
                        className="mt-2"
                        value={maxScore > 0 ? ((current?.score ?? 0) / maxScore) * 100 : 0}
                        tone="yellow"
                        label="Skor skala pertanyaan ini"
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {q.question_type !== 'text' && (
                <div className="mt-3.5 flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5">
                  <span className="text-xs text-muted-foreground">Skor pertanyaan ini</span>
                  <span className="text-xs font-semibold text-heading">{current?.score ?? 0}</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-start gap-3 rounded-xl border border-border bg-warning-soft p-3.5">
        <IconBox tone="yellow" size="sm">
          <AlertTriangle className="size-4" />
        </IconBox>
        <p className="text-sm leading-relaxed text-secondary-text">
          Jawaban Anda bersifat rahasia dan hanya dapat dilihat oleh konselor sekolah.
        </p>
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Mengirim…' : 'Kirim Kuesioner'}
      </Button>
    </form>
  );
}