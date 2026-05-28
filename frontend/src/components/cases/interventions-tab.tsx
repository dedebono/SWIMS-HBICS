'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus,
  ClipboardList,
  CheckCircle2,
  Clock,
  Star,
  Phone,
  Users,
  BookOpen,
  HeartHandshake,
  MessageSquare,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface InterventionRow {
  intervention_id: string;
  type: string;
  description: string;
  scheduled_at: string | null;
  completed_at: string | null;
  outcome: string | null;
  effectiveness: number | null;
  created_at: string;
  created_by?: string;
  assigned_staff?: string[];
  metadata?: {
    parent_notified?: boolean;
    parent_contact_name?: string;
    parent_contact_method?: string;
    handled_by_role?: string;
    handler_name?: string;
    follow_up_required?: boolean;
    follow_up_date?: string;
    notes?: string;
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const INTERVENTION_TYPES = [
  { value: 'COUNSELING_SESSION', label: 'Counseling Session', icon: '🧠' },
  { value: 'THERAPY_REFERRAL', label: 'Therapy Referral', icon: '💊' },
  { value: 'ADVISORY_MEETING', label: 'Advisory / Advice Given', icon: '💬' },
  { value: 'PARENT_MEETING', label: 'Parent / Guardian Meeting', icon: '👨‍👩‍👧' },
  { value: 'PARENT_CALL', label: 'Parent / Guardian Call', icon: '📞' },
  { value: 'DISCIPLINARY_ACTION', label: 'Disciplinary Action', icon: '⚖️' },
  { value: 'PEER_MEDIATION', label: 'Peer Mediation', icon: '🤝' },
  { value: 'ACADEMIC_SUPPORT', label: 'Academic Support Plan', icon: '📚' },
  { value: 'WELLNESS_CHECK', label: 'Wellness Check', icon: '❤️' },
  { value: 'EXTERNAL_REFERRAL', label: 'External Agency Referral', icon: '🏥' },
  { value: 'OTHER', label: 'Other', icon: '📋' },
] as const;

const CONTACT_METHODS = ['In-Person', 'Phone Call', 'Email', 'WhatsApp / Messaging', 'Letter'];

const HANDLER_ROLES = [
  { value: 'COUNSELOR', label: 'Counselor' },
  { value: 'TEACHER', label: 'Teacher' },
  { value: 'SCHOOL_HEAD', label: 'School Head / Principal' },
  { value: 'EXTERNAL', label: 'External Professional' },
];

const typeIcon = (type: string) =>
  INTERVENTION_TYPES.find((t) => t.value === type)?.icon ?? '📋';

const typeLabel = (type: string) =>
  INTERVENTION_TYPES.find((t) => t.value === type)?.label ?? type;

// ─── Effectiveness Stars ────────────────────────────────────────────────────────

function EffectivenessStars({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${
            i < value
              ? 'text-amber-400 fill-amber-400'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
      <span className="text-[10px] text-muted-foreground ml-1">{value}/5</span>
    </span>
  );
}

// ─── Intervention Card ──────────────────────────────────────────────────────────

function InterventionCard({
  inv,
  onMarkComplete,
}: {
  inv: InterventionRow;
  onMarkComplete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = inv.metadata ?? {};
  const isCompleted = !!inv.completed_at;

  return (
    <Card className="glass border-border/50 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-start justify-between gap-3 p-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-xl mt-0.5 shrink-0">{typeIcon(inv.type)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{typeLabel(inv.type)}</p>
              <Badge
                variant={isCompleted ? 'default' : 'outline'}
                className={
                  isCompleted
                    ? 'bg-green-500/15 text-green-600 border-green-500/30 text-[10px]'
                    : 'text-[10px]'
                }
              >
                {isCompleted ? (
                  <><CheckCircle2 className="w-2.5 h-2.5 mr-1" />Completed</>
                ) : (
                  <><Clock className="w-2.5 h-2.5 mr-1" />Pending</>
                )}
              </Badge>
              {meta.parent_notified && (
                <Badge variant="outline" className="text-[10px] border-blue-400/40 text-blue-500">
                  <Phone className="w-2.5 h-2.5 mr-1" />Parent Notified
                </Badge>
              )}
              {meta.follow_up_required && (
                <Badge variant="outline" className="text-[10px] border-orange-400/40 text-orange-500">
                  Follow-up Required
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-muted-foreground">
              {meta.handler_name && (
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {meta.handler_name}
                  {meta.handled_by_role && ` (${HANDLER_ROLES.find(r => r.value === meta.handled_by_role)?.label ?? meta.handled_by_role})`}
                </span>
              )}
              {inv.scheduled_at && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Scheduled: {new Date(inv.scheduled_at).toLocaleDateString()}
                </span>
              )}
              {inv.completed_at && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-3 h-3" />
                  Completed: {new Date(inv.completed_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <EffectivenessStars value={inv.effectiveness} />
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/40">
          {/* Description */}
          <div className="pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <BookOpen className="w-3 h-3" /> Description / How It Was Handled
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{inv.description}</p>
          </div>

          {/* Parent contact details */}
          {meta.parent_notified && (
            <div className="rounded-md bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-3 space-y-1">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 mb-2">
                <Phone className="w-3 h-3" /> Parent / Guardian Contact
              </p>
              {meta.parent_contact_name && (
                <div className="text-xs flex justify-between">
                  <span className="text-muted-foreground">Contact name</span>
                  <span className="font-medium">{meta.parent_contact_name}</span>
                </div>
              )}
              {meta.parent_contact_method && (
                <div className="text-xs flex justify-between">
                  <span className="text-muted-foreground">Method</span>
                  <span className="font-medium">{meta.parent_contact_method}</span>
                </div>
              )}
            </div>
          )}

          {/* Outcome */}
          {inv.outcome && (
            <div className="rounded-md bg-muted/40 border border-border/50 p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <HeartHandshake className="w-3 h-3" /> Outcome
              </p>
              <p className="text-sm whitespace-pre-wrap">{inv.outcome}</p>
              <div className="mt-2">
                <EffectivenessStars value={inv.effectiveness} />
              </div>
            </div>
          )}

          {/* Additional notes */}
          {meta.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Additional Notes
              </p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{meta.notes}</p>
            </div>
          )}

          {/* Follow-up */}
          {meta.follow_up_required && meta.follow_up_date && (
            <div className="rounded-md bg-orange-50/50 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900/30 p-3">
              <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Follow-up Required
              </p>
              <p className="text-xs mt-1">
                Scheduled for{' '}
                <span className="font-medium">
                  {new Date(meta.follow_up_date).toLocaleDateString()}
                </span>
              </p>
            </div>
          )}

          {/* Mark complete button */}
          {!isCompleted && (
            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-green-600 border-green-500/40 hover:bg-green-50 dark:hover:bg-green-950/20"
                onClick={() => onMarkComplete(inv.intervention_id)}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark as Completed
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── New Intervention Form ──────────────────────────────────────────────────────

interface FormState {
  type: string;
  handlerName: string;
  handlerRole: string;
  scheduledAt: string;
  description: string;
  parentNotified: boolean;
  parentContactName: string;
  parentContactMethod: string;
  outcome: string;
  effectiveness: string;
  followUpRequired: boolean;
  followUpDate: string;
  notes: string;
}

const defaultForm = (): FormState => ({
  type: '',
  handlerName: '',
  handlerRole: '',
  scheduledAt: new Date().toISOString().slice(0, 16),
  description: '',
  parentNotified: false,
  parentContactName: '',
  parentContactMethod: '',
  outcome: '',
  effectiveness: '',
  followUpRequired: false,
  followUpDate: '',
  notes: '',
});

// ─── Main Component ─────────────────────────────────────────────────────────────

export function InterventionsTab({ caseId }: { caseId: string }) {
  const { user } = useAuth();
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());

  // ─── Fetch ────────────────────────────────────────────────────────────────────

  const fetchInterventions = async () => {
    setIsLoading(true);
    const res = await apiClient<InterventionRow[]>(`/cases/${caseId}/interventions`);
    if (res.success && res.data) {
      setInterventions(res.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchInterventions();
  }, [caseId]);

  // ─── Form helpers ─────────────────────────────────────────────────────────────

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isFormValid = form.type.trim() !== '' && form.description.trim() !== '' && form.handlerName.trim() !== '';

  // ─── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setIsSubmitting(true);

    const body = {
      type: form.type,
      description: form.description,
      scheduled_at: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
      outcome: form.outcome.trim() || undefined,
      effectiveness: form.effectiveness ? Number(form.effectiveness) : undefined,
      metadata: {
        handler_name: form.handlerName.trim(),
        handled_by_role: form.handlerRole || undefined,
        parent_notified: form.parentNotified,
        parent_contact_name: form.parentNotified ? form.parentContactName.trim() || undefined : undefined,
        parent_contact_method: form.parentNotified ? form.parentContactMethod || undefined : undefined,
        follow_up_required: form.followUpRequired,
        follow_up_date: form.followUpRequired && form.followUpDate
          ? new Date(form.followUpDate).toISOString()
          : undefined,
        notes: form.notes.trim() || undefined,
      },
    };

    const res = await apiClient<InterventionRow>(`/cases/${caseId}/interventions`, {
      method: 'POST',
      body,
    });

    if (res.success && res.data) {
      setInterventions((prev) => [res.data!, ...prev]);
      setForm(defaultForm());
      setDialogOpen(false);
      toast.success('Intervention logged successfully.');
    } else {
      toast.error(res.error ?? 'Failed to log intervention.');
    }

    setIsSubmitting(false);
  };

  // ─── Mark complete ────────────────────────────────────────────────────────────

  const handleMarkComplete = async (interventionId: string) => {
    const res = await apiClient<InterventionRow>(`/interventions/${interventionId}`, {
      method: 'PATCH',
      body: { completed_at: new Date().toISOString() },
    });
    if (res.success && res.data) {
      setInterventions((prev) =>
        prev.map((i) => (i.intervention_id === interventionId ? res.data! : i))
      );
      toast.success('Intervention marked as completed.');
    } else {
      toast.error('Failed to update intervention.');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  const canLog = ['COUNSELOR', 'TEACHER', 'SUBSTITUTE_TEACHER', 'SCHOOL_HEAD'].includes(
    user?.role ?? ''
  );

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            Interventions
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {interventions.length} recorded &mdash; how this case was handled
          </p>
        </div>

        {canLog && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
              <Plus className="w-3.5 h-3.5" />
              Log Intervention
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-primary" />
                  Log Intervention
                </DialogTitle>
                <DialogDescription>
                  Record how this case was handled — therapy, advice, parent contact, or other action.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* ── Intervention Type ── */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Intervention Type <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.type} onValueChange={(v) => setField('type', v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVENTION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.icon}&nbsp;&nbsp;{t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* ── Who Handled ── */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Handled By (Name) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. Ms. Siti"
                      value={form.handlerName}
                      onChange={(e) => setField('handlerName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Role</Label>
                    <Select value={form.handlerRole} onValueChange={(v) => setField('handlerRole', v ?? '')}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select role…" />
                      </SelectTrigger>
                      <SelectContent>
                        {HANDLER_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* ── Date / Time ── */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Date &amp; Time of Intervention</Label>
                  <Input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => setField('scheduledAt', e.target.value)}
                  />
                </div>

                {/* ── Description ── */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Description / How It Was Handled <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    placeholder="Describe what was done — session topics, advice given, actions taken…"
                    value={form.description}
                    onChange={(e) => setField('description', e.target.value)}
                    rows={4}
                  />
                </div>

                {/* ── Parent Notified ── */}
                <div className="rounded-lg border border-border/50 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                      <Phone className="w-3.5 h-3.5 text-blue-500" />
                      Parent / Guardian Notified
                    </Label>
                    <button
                      type="button"
                      onClick={() => setField('parentNotified', !form.parentNotified)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        form.parentNotified
                          ? 'bg-blue-500'
                          : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          form.parentNotified ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {form.parentNotified && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Parent / Guardian Name</Label>
                        <Input
                          placeholder="e.g. Encik Ahmad"
                          value={form.parentContactName}
                          onChange={(e) => setField('parentContactName', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Contact Method</Label>
                        <Select
                          value={form.parentContactMethod}
                          onValueChange={(v) => setField('parentContactMethod', v ?? '')}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Method…" />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTACT_METHODS.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Outcome ── */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Outcome <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    placeholder="Describe the result or response…"
                    value={form.outcome}
                    onChange={(e) => setField('outcome', e.target.value)}
                    rows={3}
                  />
                </div>

                {/* ── Effectiveness ── */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Effectiveness <span className="text-muted-foreground font-normal">(1 = low, 5 = high)</span>
                  </Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          setField('effectiveness', form.effectiveness === String(n) ? '' : String(n))
                        }
                        className="focus:outline-none"
                      >
                        <Star
                          className={`w-6 h-6 transition-colors ${
                            Number(form.effectiveness) >= n
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-muted-foreground/30 hover:text-amber-200'
                          }`}
                        />
                      </button>
                    ))}
                    {form.effectiveness && (
                      <span className="text-xs text-muted-foreground self-center ml-1">
                        {form.effectiveness}/5
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Follow-up ── */}
                <div className="rounded-lg border border-border/50 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                      <Clock className="w-3.5 h-3.5 text-orange-500" />
                      Follow-up Required
                    </Label>
                    <button
                      type="button"
                      onClick={() => setField('followUpRequired', !form.followUpRequired)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        form.followUpRequired ? 'bg-orange-500' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          form.followUpRequired ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  {form.followUpRequired && (
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-xs font-semibold">Follow-up Date</Label>
                      <Input
                        type="date"
                        value={form.followUpDate}
                        onChange={(e) => setField('followUpDate', e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* ── Additional Notes ── */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Additional Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    placeholder="Any other relevant observations or context…"
                    value={form.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>

              <DialogFooter showCloseButton>
                <Button
                  onClick={handleSubmit}
                  disabled={!isFormValid || isSubmitting}
                  className="gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <ClipboardList className="w-3.5 h-3.5" />
                      Log Intervention
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading interventions…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && interventions.length === 0 && (
        <Card className="glass border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center py-14 gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-primary/60" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No interventions recorded yet</p>
            <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
              Log how this case has been handled — counseling sessions, parent meetings, therapy referrals, and more.
            </p>
            {canLog && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 gap-1.5"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Log First Intervention
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Intervention list */}
      {!isLoading && interventions.length > 0 && (
        <div className="space-y-3">
          {interventions.map((inv) => (
            <InterventionCard
              key={inv.intervention_id}
              inv={inv}
              onMarkComplete={handleMarkComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
