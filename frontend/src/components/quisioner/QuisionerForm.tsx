'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';

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
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
        <p className="text-sm text-muted-foreground">
          Total Skor: <span className="font-semibold text-foreground">{totalScore}</span> &nbsp;·&nbsp; Ambang
          batas: <span className="font-semibold text-foreground">{threshold}</span>
        </p>
        <Badge className={recommendation === 'professional' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
          {recommendation === 'professional' ? 'Rekomendasi: Profesional' : 'Rekomendasi: Internal'}
        </Badge>
      </div>

      {questions.map((q, i) => {
        const qAnswers = answersMap[q.question_id] || [];
        const current = answers[q.question_id];
        return (
          <Card key={q.question_id}>
            <CardHeader>
              <CardTitle className="text-base">
                {i + 1}. {q.question_text}
              </CardTitle>
              {q.is_required && <CardDescription>Pertanyaan wajib diisi</CardDescription>}
            </CardHeader>
            <CardContent>
              {q.question_type === 'text' && (
                <Textarea
                  value={current?.answer_text || ''}
                  onChange={(e) => onAnswerChange(q.question_id, { answer_text: e.target.value, score: 0 })}
                  placeholder="Tuliskan jawaban Anda..."
                  rows={3}
                />
              )}

              {q.question_type === 'multiple_choice' && (
                <div className="grid gap-2">
                  {qAnswers.map((a) => (
                    <label
                      key={a.answer_id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                        current?.answer_text === a.answer_text ? 'border-primary bg-primary/5' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.question_id}
                        checked={current?.answer_text === a.answer_text}
                        onChange={() => onAnswerChange(q.question_id, { answer_text: a.answer_text, score: a.score })}
                      />
                      <span className="flex-1">{a.answer_text}</span>
                      <Badge variant="outline">{a.score}</Badge>
                    </label>
                  ))}
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
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                          checked ? 'border-primary bg-primary/5' : ''
                        }`}
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
                        />
                        <span className="flex-1">{a.answer_text}</span>
                        <Badge variant="outline">{a.score}</Badge>
                      </label>
                    );
                  })}
                </div>
              )}

              {q.question_type === 'rating' && (
                <div className="flex flex-wrap gap-2">
                  {qAnswers.map((a) => (
                    <Button
                      key={a.answer_id}
                      type="button"
                      variant={current?.answer_text === a.answer_text ? 'default' : 'outline'}
                      onClick={() => onAnswerChange(q.question_id, { answer_text: a.answer_text, score: a.score })}
                    >
                      {a.answer_text} <span className="ml-1 text-xs opacity-70">({a.score})</span>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4" />
        Jawaban Anda bersifat rahasia dan hanya dapat dilihat oleh konselor sekolah.
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Mengirim...' : 'Kirim Quisioner'}
      </Button>
    </form>
  );
}
