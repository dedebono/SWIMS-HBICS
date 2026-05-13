'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';

interface FormData {
  student_id: string;
  case_id: string;
  category: string;
  sub_category: string;
  severity: string;
  description: string;
  location: string;
  incident_at: string;
  immediate_actions: string;
  involved_students_raw: string;
  evidence_cctv: boolean;
  evidence_photo: boolean;
  evidence_video: boolean;
  evidence_screenshot: boolean;
  evidence_witness: boolean;
  evidence_none: boolean;
  assess_recurring: boolean;
  assess_similar: boolean;
  assess_escalation: boolean;
  assess_parent_comm: boolean;
}

export default function NewIncidentPage() {
  const router = useRouter();
  const [step, setStep] = useState<'identify' | 'details'>('identify');
  const [qrMode, setQrMode] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormData>({
    student_id: '',
    case_id: '',
    category: '',
    sub_category: '',
    severity: '',
    description: '',
    location: '',
    incident_at: new Date().toISOString().slice(0, 16),
    immediate_actions: '',
    involved_students_raw: '',
    evidence_cctv: false,
    evidence_photo: false,
    evidence_video: false,
    evidence_screenshot: false,
    evidence_witness: false,
    evidence_none: false,
    assess_recurring: false,
    assess_similar: false,
    assess_escalation: false,
    assess_parent_comm: false,
  });

  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleStudentSelect = (studentId: string) => {
    updateField('student_id', studentId);
    setStep('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (!formData.case_id) {
      setError('Please select or create a case first');
      setIsSubmitting(false);
      return;
    }

    const res = await apiClient(`/cases/${formData.case_id}/incidents`, {
      method: 'POST',
      body: {
        student_id: formData.student_id,
        category: formData.category,
        sub_category: formData.sub_category || undefined,
        severity: formData.severity,
        description: formData.description,
        location: formData.location || undefined,
        incident_at: new Date(formData.incident_at).toISOString(),
        immediate_actions: formData.immediate_actions || undefined,
        metadata: {
          involved_students: formData.involved_students_raw.split(',').map(s => s.trim()).filter(Boolean),
          evidence: {
            cctv: formData.evidence_cctv,
            photo: formData.evidence_photo,
            video: formData.evidence_video,
            screenshot: formData.evidence_screenshot,
            witness: formData.evidence_witness,
            none: formData.evidence_none,
          },
          initial_assessment: {
            is_recurring: formData.assess_recurring,
            similar_cases: formData.assess_similar,
            needs_escalation: formData.assess_escalation,
            needs_parent_comm: formData.assess_parent_comm,
          }
        }
      },
    });

    if (res.success) {
      router.push(`/dashboard/cases/${formData.case_id}`);
    } else {
      setError(res.error ?? 'Failed to submit incident');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Report Incident</h2>
        <p className="text-muted-foreground">
          Record a new student incident with details and context
        </p>
      </div>

      {/* Step 1: Student Identification */}
      {step === 'identify' && (
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle>Step 1: Identify Student</CardTitle>
            <CardDescription>
              Scan a QR code or search manually
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={!qrMode ? 'default' : 'outline'}
                onClick={() => setQrMode(false)}
                className="flex-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Manual Search
              </Button>
              <Button
                variant={qrMode ? 'default' : 'outline'}
                onClick={() => setQrMode(true)}
                className="flex-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                QR Scanner
              </Button>
            </div>

            {qrMode ? (
              <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border p-12">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/30">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                <p className="text-sm text-muted-foreground">
                  QR Scanner requires camera access (react-qr-reader).
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Full implementation in Phase 2. Use manual search for now.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  placeholder="Search by student name or class..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter a student ID manually for Phase 1:
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Student UUID"
                    value={formData.student_id}
                    onChange={(e) => updateField('student_id', e.target.value)}
                  />
                  <Button
                    onClick={() => handleStudentSelect(formData.student_id)}
                    disabled={!formData.student_id}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Incident Details */}
      {step === 'details' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="glass border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Step 2: Incident Details</CardTitle>
                  <CardDescription>
                    Student: <span className="font-mono text-xs">{formData.student_id.slice(0, 8)}...</span>
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep('identify')}>
                  Change Student
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Case Selection */}
              <div className="space-y-2">
                <Label htmlFor="case-id">Case ID *</Label>
                <Input
                  id="case-id"
                  placeholder="Select or enter existing case UUID"
                  value={formData.case_id}
                  onChange={(e) => updateField('case_id', e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Link this incident to an existing case
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Category */}
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={formData.category} onValueChange={(v) => updateField('category', v ?? '')}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Aggression">Aggression</SelectItem>
                      <SelectItem value="Bullying">Bullying</SelectItem>
                      <SelectItem value="Disruption">Disruption</SelectItem>
                      <SelectItem value="Withdrawal">Withdrawal</SelectItem>
                      <SelectItem value="Self-Harm">Self-Harm</SelectItem>
                      <SelectItem value="Substance">Substance</SelectItem>
                      <SelectItem value="Attendance">Attendance</SelectItem>
                      <SelectItem value="Medical">Medical</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Severity */}
                <div className="space-y-2">
                  <Label htmlFor="severity">Severity *</Label>
                  <Select value={formData.severity} onValueChange={(v) => updateField('severity', v ?? '')}>
                    <SelectTrigger id="severity">
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-low" /> Low
                        </span>
                      </SelectItem>
                      <SelectItem value="MEDIUM">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-medium" /> Medium
                        </span>
                      </SelectItem>
                      <SelectItem value="HIGH">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-high" /> High
                        </span>
                      </SelectItem>
                      <SelectItem value="CRITICAL">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-severity-critical" /> Critical
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Sub-category */}
              <div className="space-y-2">
                <Label htmlFor="sub-category">Sub-category</Label>
                <Input
                  id="sub-category"
                  placeholder="Optional sub-category"
                  value={formData.sub_category}
                  onChange={(e) => updateField('sub_category', e.target.value)}
                />
              </div>

              {/* Involved Students */}
              <div className="space-y-2">
                <Label htmlFor="involved">Involved Students / Victim(s)</Label>
                <Input
                  id="involved"
                  placeholder="Names of other students involved, separated by commas"
                  value={formData.involved_students_raw}
                  onChange={(e) => updateField('involved_students_raw', e.target.value)}
                />
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g. Classroom 8A, Playground, Cafeteria"
                  value={formData.location}
                  onChange={(e) => updateField('location', e.target.value)}
                />
              </div>

              {/* Date/Time */}
              <div className="space-y-2">
                <Label htmlFor="incident-at">Date & Time *</Label>
                <Input
                  id="incident-at"
                  type="datetime-local"
                  value={formData.incident_at}
                  onChange={(e) => updateField('incident_at', e.target.value)}
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the incident in detail. Use neutral, non-labeling language."
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={5}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  💡 Use objective, neutral language. Avoid stigmatizing terms.
                </p>
              </div>

              {/* Immediate Actions */}
              <div className="space-y-2">
                <Label htmlFor="immediate-actions">Immediate Actions Taken</Label>
                <Textarea
                  id="immediate-actions"
                  placeholder="Describe any actions taken immediately after the incident..."
                  value={formData.immediate_actions}
                  onChange={(e) => updateField('immediate_actions', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2 pt-4 border-t">
                {/* Evidence Section */}
                <div className="space-y-3">
                  <Label>Evidence Available</Label>
                  <div className="space-y-2">
                    {[
                      { key: 'evidence_cctv', label: 'CCTV' },
                      { key: 'evidence_photo', label: 'Foto' },
                      { key: 'evidence_video', label: 'Video' },
                      { key: 'evidence_screenshot', label: 'Screenshot' },
                      { key: 'evidence_witness', label: 'Witness Statement' },
                      { key: 'evidence_none', label: 'Tidak ada bukti' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={item.key}
                          className="h-4 w-4 rounded border-border"
                          checked={formData[item.key as keyof FormData] as boolean}
                          onChange={(e) => updateField(item.key as keyof FormData, e.target.checked as any)}
                        />
                        <Label htmlFor={item.key} className="text-sm font-normal cursor-pointer">
                          {item.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Initial Assessment Section */}
                <div className="space-y-3">
                  <Label>Initial Assessment</Label>
                  <div className="space-y-2">
                    {[
                      { key: 'assess_recurring', label: 'Apakah kejadian berulang?' },
                      { key: 'assess_similar', label: 'Apakah siswa pernah punya kasus serupa?' },
                      { key: 'assess_escalation', label: 'Apakah perlu eskalasi?' },
                      { key: 'assess_parent_comm', label: 'Apakah perlu parent communication?' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={item.key}
                          className="h-4 w-4 rounded border-border"
                          checked={formData[item.key as keyof FormData] as boolean}
                          onChange={(e) => updateField(item.key as keyof FormData, e.target.checked as any)}
                        />
                        <Label htmlFor={item.key} className="text-sm font-normal cursor-pointer">
                          {item.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Media Upload Zone (Stub) */}
              <div className="space-y-2">
                <Label>Attachments</Label>
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/30">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="text-sm text-muted-foreground">
                    Drag & drop files here
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Media upload available in Phase 2
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="button" variant="secondary">
              Save as Draft
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.category || !formData.severity || !formData.description}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Submitting...
                </span>
              ) : (
                'Submit Incident'
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
