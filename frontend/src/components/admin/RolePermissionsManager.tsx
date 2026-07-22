"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, RefreshCw, Save, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

// ─── Config ────────────────────────────────────────────────────────────────────

const ROLES = [
  "TEACHER",
  "COUNSELOR",
  "SCHOOL_HEAD",
  "SCHOOL_NURSE",
  "PERSONAL",
] as const;

const RESOURCES: { key: string; label: string }[] = [
  { key: "cases", label: "Cases" },
  { key: "incidents", label: "Incidents" },
  { key: "interventions", label: "Interventions" },
  { key: "media_assets", label: "Media Assets" },
  { key: "alerts", label: "Alerts" },
  { key: "reports", label: "Reports" },
  { key: "consents", label: "Consents" },
  { key: "audit_logs", label: "Audit Logs" },
  { key: "positive_observations", label: "Positive Observations" },
  { key: "students", label: "Students" },
  { key: "admin", label: "Admin" },
];

const CRUD_ACTIONS = ["create", "read", "update", "delete"] as const;
// The 'admin' resource additionally exposes a 'manage' action.
const ADMIN_EXTRA_ACTIONS = ["manage"] as const;

type RoleSlice = Record<string, Record<string, boolean>>;
type Matrix = Record<string, RoleSlice>;

function actionsForResource(resource: string): string[] {
  if (resource === "admin") return [...CRUD_ACTIONS, ...ADMIN_EXTRA_ACTIONS];
  return [...CRUD_ACTIONS];
}

function roleLabel(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function RolePermissionsManager() {
  const [matrix, setMatrix] = useState<Matrix>({});
  const [selectedRole, setSelectedRole] = useState<string>(ROLES[0]);
  const [draft, setDraft] = useState<RoleSlice>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [open, setOpen] = useState(false);

  const loadMatrix = async (showToast = false) => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data?: Matrix }>("/admin/role-permissions");
      if (res.success && res.data) {
        setMatrix(res.data as Matrix);
        if (showToast) toast.success("Role permissions refreshed.");
      } else {
        toast.error("Failed to load role permissions");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while fetching role permissions");
    } finally {
      setIsLoading(false);
    }
  };

  // Load once
  useEffect(() => {
    loadMatrix(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the matrix or selected role changes, copy the role slice into the editable draft
  useEffect(() => {
    const slice = matrix[selectedRole] ?? {};
    // Ensure every configured resource/action is present in the draft
    const next: RoleSlice = {};
    for (const r of RESOURCES) {
      next[r.key] = { ...(slice[r.key] ?? {}) };
    }
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, selectedRole]);

  const toggle = (resource: string, action: string, value: boolean) => {
    setDraft((prev) => ({
      ...prev,
      [resource]: {
        ...(prev[resource] ?? {}),
        [action]: value,
      },
    }));
  };

  const isDirty = useMemo(() => {
    const base = matrix[selectedRole] ?? {};
    const baseNorm: RoleSlice = {};
    for (const r of RESOURCES) baseNorm[r.key] = { ...(base[r.key] ?? {}) };
    return JSON.stringify(baseNorm) !== JSON.stringify(draft);
  }, [matrix, selectedRole, draft]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await apiClient<RoleSlice>(`/admin/role-permissions/${selectedRole}`, {
        method: "PUT",
        body: draft,
      });
      if (res.success && res.data) {
        setMatrix((prev) => ({ ...prev, [selectedRole]: res.data as RoleSlice }));
        toast.success(`${roleLabel(selectedRole)} permissions updated.`);
      } else {
        toast.error(res.error || "Failed to update permissions.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await apiClient<RoleSlice>(`/admin/role-permissions/${selectedRole}/reset`, {
        method: "POST",
        body: {},
      });
      if (res.success && res.data) {
        setMatrix((prev) => ({ ...prev, [selectedRole]: res.data as RoleSlice }));
        toast.success(`${roleLabel(selectedRole)} permissions reset to defaults.`);
      } else {
        toast.error(res.error || "Failed to reset permissions.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Card className="glass shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setOpen(o => !o)} aria-label="Toggle role permissions">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Role Permissions
            </CardTitle>
            <CardDescription>
              Configure what each role can do across the system. Changes apply immediately to all users with that role in your organization.
              Scoping rules (e.g. teachers see only their class, nurses see only medical cases) still apply on top of these toggles.
            </CardDescription>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadMatrix(true)} disabled={isLoading} className="shrink-0">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>

      {open && (
      <>
      <CardContent>
        <div className="pt-2 flex flex-col md:flex-row md:items-end gap-4 mb-4">
          <div className="space-y-2 w-full md:w-72">
            <Label>Role</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v ?? selectedRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {isLoading ? (
          <div className="text-center py-16">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary/50" />
            <p className="text-sm text-muted-foreground mt-2">Loading permissions...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-separate border-spacing-0">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <th className="px-4 py-3 rounded-tl-md">Resource</th>
                  {CRUD_ACTIONS.map((a) => (
                    <th key={a} className="px-4 py-3 text-center capitalize">{a}</th>
                  ))}
                  <th className="px-4 py-3 text-center rounded-tr-md">Manage</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map((r, idx) => {
                  const isLast = idx === RESOURCES.length - 1;
                  return (
                    <tr key={r.key} className="border-t border-muted/50">
                      <td className="px-4 py-3 font-medium">{r.label}</td>
                      {CRUD_ACTIONS.map((a) => (
                        <td key={a} className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <Switch
                              checked={Boolean(draft[r.key]?.[a])}
                              onCheckedChange={(v) => toggle(r.key, a, v)}
                              aria-label={`${r.label} ${a}`}
                            />
                          </div>
                        </td>
                      ))}
                      <td className={`px-4 py-3 text-center ${isLast ? "rounded-br-md" : ""}`}>
                        <div className="flex justify-center">
                          <Switch
                            checked={Boolean(draft[r.key]?.["manage"])}
                            onCheckedChange={(v) => toggle(r.key, "manage", v)}
                            aria-label={`${r.label} manage`}
                            disabled={r.key !== "admin"}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Separator />

      <CardFooter className="border-t p-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={isResetting || isSaving || isLoading}
          className="sm:mr-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isResetting ? "animate-spin" : ""}`} />
          Reset to defaults
        </Button>
        <Button onClick={handleSave} disabled={!isDirty || isSaving || isResetting || isLoading}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
      </CardFooter>
      </>
      )}
    </Card>
  );
}
