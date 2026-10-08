"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, UploadCloud, RefreshCw, Search, Filter, ArrowUpDown, ChevronUp, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import Papa from "papaparse";
import RolePermissionsManager from "@/components/admin/RolePermissionsManager";
import {
  ACCOUNT_ROLES,
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  type AccountRole,
  type LoginRole,
} from "@/lib/constants";

interface UserData {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  type: 'STAFF' | 'STUDENT';
  national_id?: string;
  gender?: string | null;
  phone_number?: string | null;
}

export default function AdminUsersPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    role: "STUDENT" as AccountRole,
    national_id: "",
    password: "",
    gender: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [allUsersOpen, setAllUsersOpen] = useState(false);

  // Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<'full_name' | 'role'>('full_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Edit dialog state
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    role: "" as string,
    is_active: true,
    password: "",
    gender: "",
    phone_number: "",
    national_id: "",
  });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  const fetchUsers = async (showToast = false) => {
    setIsLoadingUsers(true);
    try {
      const res = await apiClient<{ data?: UserData[] }>("/admin/users");
      if (res.success) {
        setUsers(res.data as any || []);
        if (showToast) toast.success("User directory refreshed successfully.");
      } else {
        toast.error("Failed to load user list");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while fetching users");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers(false);
  }, []);

  const filteredAndSortedUsers = users
    .filter(user => {
      const matchesSearch = user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
                           (user.national_id?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      const factor = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'full_name') {
        return a.full_name.localeCompare(b.full_name) * factor;
      } else {
        return a.role.localeCompare(b.role) * factor;
      }
    });

  const toggleSort = (field: 'full_name' | 'role') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || (!formData.email && formData.role !== 'STUDENT')) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const body: any = {
        full_name: formData.full_name,
        email: formData.email,
        role: formData.role,
        national_id: formData.national_id || undefined,
        gender: formData.gender || undefined,
      };
      if (formData.password) body.password = formData.password;

      const res = await apiClient("/admin/users", {
        method: "POST",
        body,
      });

      if (res.success) {
        toast.success(`User ${formData.full_name} has been added successfully!`);
        setFormData({ full_name: "", email: "", role: "STUDENT", national_id: "", password: "", gender: "" });
        fetchUsers();
      } else {
        toast.error(res.error || "Failed to add user.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (user: UserData) => {
    setEditUser(user);
    setEditForm({
      full_name: user.full_name,
      email: user.email || "",
      role: user.role,
      is_active: user.is_active,
      password: "",
      gender: user.gender || "",
      phone_number: user.phone_number || "",
      national_id: user.national_id || "",
    });
    setIsEditSubmitting(false);
  };

  const closeEditDialog = () => {
    setEditUser(null);
    setEditForm({ full_name: "", email: "", role: "", is_active: true, password: "", gender: "", phone_number: "", national_id: "" });
  };

  const handleEditSubmit = async () => {
    if (!editUser) return;
    if (!editForm.full_name) {
      toast.error("Full name is required.");
      return;
    }

    setIsEditSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        full_name: editForm.full_name,
      };
      // Only send email for non-STUDENT types
      if (editUser.type !== 'STUDENT') {
        if (editForm.email) body.email = editForm.email;
        body.role = editForm.role;
        body.is_active = editForm.is_active;
        body.gender = editForm.gender || null;
      } else {
        // Students: allow phone number to be set/updated here (used for WAHA notifications)
        body.phone_number = editForm.phone_number || null;
      }
      // NIK — sent for all user types (required for staff booking)
      body.national_id = editForm.national_id || null;
      if (editForm.password) body.password = editForm.password;

      const res = await apiClient(`/admin/users/${editUser.id}`, {
        method: "PUT",
        body,
      });

      if (res.success) {
        toast.success(`User ${editForm.full_name} updated successfully.`);
        closeEditDialog();
        fetchUsers();
      } else {
        toast.error(res.error || "Failed to update user.");
      }
    } catch (err) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,full_name,email,role,national_id\nJohn Doe,john.doe@example.edu,STUDENT,123456789\nJane Smith,jane.smith@example.edu,TEACHER,987654321";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "user_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Template downloaded.");
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      toast.error("Please select a CSV file first.");
      return;
    }

    setIsBulkSubmitting(true);
    Papa.parse(bulkFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const seenEmails = new Set<string>();
          let skippedLocal = 0;

          // Validate and clean data — skip rows missing name / with invalid or
          // duplicate email; upload the rest.
          //
          // STUDENT rows are the exception on both counts: a student is a record
          // in `students`, not a login account, so it needs no email (the
          // optional `parent_email`/`email` column is stored as
          // students.parent_email). Requiring a valid email silently dropped
          // every student row from a CSV before.
          const KNOWN_ROLES = new Set<string>(ACCOUNT_ROLES as readonly string[]);
          const parsedUsers = (results.data as any[])
            .map((row: any) => ({
              full_name: row.full_name?.trim(),
              email: row.email?.trim() || undefined,
              role: (row.role?.trim().toUpperCase() || "STUDENT") as AccountRole,
              national_id: row.national_id?.trim() || undefined,
              gender: row.gender?.trim() || undefined,
              phone_number: row.phone_number?.trim() || undefined,
              date_of_birth: row.date_of_birth?.trim() || undefined,
              parent_email: row.parent_email?.trim() || undefined,
            }))
            .filter((u) => {
              // Drop rows naming a role the backend would reject outright —
              // the bulk endpoint is one transaction, so one bad role would
              // roll back the entire batch.
              if (!KNOWN_ROLES.has(u.role)) {
                skippedLocal++;
                return false;
              }

              const emailLower = u.email?.toLowerCase();
              // Staff need a unique, valid email; students need neither.
              if (u.role === "STUDENT") {
                if (!u.full_name) {
                  skippedLocal++;
                  return false;
                }
                return true;
              }
              if (!u.full_name || !emailLower || !emailRegex.test(emailLower) || seenEmails.has(emailLower)) {
                skippedLocal++;
                return false;
              }
              seenEmails.add(emailLower);
              return true;
            });

          if (parsedUsers.length === 0) {
            toast.error("No valid users found in the CSV. Please check the format.");
            setIsBulkSubmitting(false);
            return;
          }

          toast.info(`Uploading ${parsedUsers.length} users...`);

          const res = await apiClient<{ created: number, duplicates: number, invalid?: number, failed?: number }>("/admin/users/bulk", {
            method: "POST",
            body: { users: parsedUsers },
          });

          if (res.success && res.data) {
            const { created, duplicates, invalid = 0, failed = 0 } = res.data;
            const skippedTotal = skippedLocal + invalid;
            let msg = `Bulk import complete! Added ${created} users.`;
            if (duplicates) msg += ` Skipped ${duplicates} duplicates.`;
            if (skippedTotal) msg += ` Ignored ${skippedTotal} invalid rows.`;
            if (failed) msg += ` ${failed} rows failed.`;
            toast.success(msg);
            setBulkFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            fetchUsers();
          } else {
            toast.error(res.error || "Failed to bulk import users.");
          }
        } catch (err) {
          toast.error("An unexpected error occurred during import.");
        } finally {
          setIsBulkSubmitting(false);
        }
      },
      error: (error) => {
        toast.error(`Error parsing CSV: ${error.message}`);
        setIsBulkSubmitting(false);
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          User Directory Management
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2">
          Onboard new students, teachers, and staff members into your organization. Initial password will be set to: Welcome123!
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* MANUAL ENTRY */}
        <Card className="glass shadow-sm">
          <form onSubmit={handleManualSubmit}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                Manual Entry
              </CardTitle>
              <CardDescription>
                Add a single user to the directory manually.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input 
                  placeholder="e.g. John Doe" 
                  value={formData.full_name}
                  onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email Address {formData.role !== 'STUDENT' && '*'}</Label>
                <Input 
                  type="email" 
                  placeholder="john@example.edu" 
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required={formData.role !== 'STUDENT'}
                />
              </div>
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v as AccountRole })}
                  items={ROLE_LABELS}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Gender (Optional)</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(v) => setFormData({ ...formData, gender: v ?? "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>National ID / Student ID (Optional)</Label>
                <Input
                  placeholder="e.g. 123456789"
                  value={formData.national_id}
                  onChange={e => setFormData({ ...formData, national_id: e.target.value })}
                />
              </div>
              <div 
              style={{marginBottom :'10px'}}
              className="space-y-2">
                <Label>Password (Optional — defaults to Welcome123!)</Label>
                <Input
                  type="password"
                  placeholder="Leave blank for default password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </CardContent>
            <CardFooter className="border-t p-6">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Adding User..." : "Add User"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* BULK UPLOAD */}
        <Card className="glass shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-blue-500" />
              Bulk CSV Upload
            </CardTitle>
            <CardDescription>
              Quickly onboard students and staff using a CSV file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div 
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${bulkFile ? 'border-primary bg-primary/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                ref={fileInputRef}
                onChange={e => {
                  const file = e.target.files?.[0] || null;
                  setBulkFile(file);
                  if (file) toast.success(`Selected file: ${file.name}`);
                }}
              />
              <UploadCloud className={`h-10 w-10 mb-4 ${bulkFile ? 'text-primary' : 'text-muted-foreground'}`} />
              {bulkFile ? (
                <>
                  <p className="text-sm font-medium text-primary">{bulkFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{(bulkFile.size / 1024).toFixed(2)} KB</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Click to browse from your computer</p>
                  <p className="text-xs text-muted-foreground mt-1">Must be a .csv file</p>
                </>
              )}
            </div>
            <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
              <span className="text-sm">Need the correct format?</span>
              <Button variant="link" className="h-auto p-0" onClick={downloadTemplate}>
                Download Template
              </Button>
            </div>
          </CardContent>
          <CardFooter className="border-t p-6">
            <Button
              className="w-full"
              disabled={!bulkFile || isBulkSubmitting}
              onClick={handleBulkUpload}
            >
              {isBulkSubmitting ? "Uploading..." : "Create Bulk Users"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* ALL USERS LIST */}
      <Card className="glass shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setAllUsersOpen(o => !o)} aria-label="Toggle users list">
              {allUsersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                All Directory Users
                <span className="text-xs font-normal text-muted-foreground">({users.length})</span>
              </CardTitle>
              <CardDescription>View all students and staff members in the system.</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchUsers(true)} disabled={isLoadingUsers}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingUsers ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        {allUsersOpen && (
        <CardContent>
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by name, email, or ID..." 
                className="pl-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-full md:w-48">
              <Select
                value={roleFilter}
                onValueChange={(value) => setRoleFilter(value ?? 'ALL')}
                items={{ ALL: 'All Roles', ...ROLE_LABELS }}
              >
                <SelectTrigger>
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Filter by Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Roles</SelectItem>
                  {ACCOUNT_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoadingUsers ? (
            <div className="text-center py-20">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary/50" />
              <p className="text-sm text-muted-foreground mt-2">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground border border-dashed rounded-lg">
              No users found. Try adding some above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    <th 
                      className="px-4 py-3 rounded-tl-md cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => toggleSort('full_name')}
                    >
                      <div className="flex items-center gap-2">
                        Full Name
                        {sortField === 'full_name' ? (
                          sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left">Student ID / Account ID</th>
                    <th className="px-4 py-3">Type</th>
                    <th 
                      className="px-4 py-3 cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => toggleSort('role')}
                    >
                      <div className="flex items-center gap-2">
                        Role
                        {sortField === 'role' ? (
                          sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </div>
                    </th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3 rounded-tr-md text-right">Joined</th>
                    <th className="px-4 py-3 rounded-tr-md text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredAndSortedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{user.full_name}</div>
                        {user.gender && <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{user.gender}</div>}
                      </td>
                      <td className="px-4 py-4">
                        <code className="text-[11px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-mono text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                          {user.type === 'STUDENT' ? (user.national_id || 'no-id') : user.id.slice(0, 8)}
                        </code>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${user.type === 'STUDENT' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'}`}>
                          {user.type}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-tight">
                          {user.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {user.email || <span className="text-zinc-300 dark:text-zinc-700">no-email</span>}
                      </td>
                      <td className="px-4 py-4">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-zinc-300'}`}></span>
                          <span className={`text-[11px] ${user.is_active ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {user.phone_number || <span className="text-zinc-300 dark:text-zinc-700">no-phone</span>}
                      </td>
                      <td className="px-4 py-4 text-right text-muted-foreground tabular-nums text-[11px]">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                          className="h-8 w-8 p-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* EDIT USER DIALOG */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="overflow-y-auto" style={{ width: '384px', maxWidth: '384px', aspectRatio: '1 / 1' }}>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update details for {editUser?.full_name}. Leave password blank to keep current.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                value={editForm.full_name}
                onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            {editUser?.type !== 'STUDENT' ? (
              <>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="email@example.edu"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={v => setEditForm({ ...editForm, role: v ?? '' })}
                    items={ROLE_LABELS}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Gender (Optional)</Label>
                  <Select
                    value={editForm.gender}
                    onValueChange={(v) => setEditForm({ ...editForm, gender: v ?? "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>NIK / National ID *</Label>
                  <Input
                    value={editForm.national_id}
                    onChange={e => setEditForm({ ...editForm, national_id: e.target.value })}
                    placeholder="e.g. 1234567890123456"
                    required
                  />
                  <p className="text-xs text-muted-foreground">Required for staff booking via QR code.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={editForm.is_active}
                    onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active account</Label>
                </div>
                <div className="space-y-2">
                  <Label>New Password (optional)</Label>
                  <Input
                    type="password"
                    value={editForm.password}
                    onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="Leave blank to keep current password"
                  />
                  <p className="text-xs text-muted-foreground">Min 8 characters</p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Phone Number (Optional)</Label>
                  <Input
                    type="tel"
                    value={editForm.phone_number}
                    onChange={e => setEditForm({ ...editForm, phone_number: e.target.value })}
                    placeholder="e.g., +628****7890"
                  />
                  <p className="text-xs text-muted-foreground">Include country code (e.g., +62 for Indonesia). Used for WhatsApp appointment notifications.</p>
                </div>
                <div className="space-y-2">
                  <Label>NIK / National ID *</Label>
                  <Input
                    value={editForm.national_id}
                    onChange={e => setEditForm({ ...editForm, national_id: e.target.value })}
                    placeholder="e.g. 1234567890123456"
                    required
                  />
                  <p className="text-xs text-muted-foreground">Required for staff booking via QR code.</p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={isEditSubmitting}>
              {isEditSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ROLE PERMISSIONS MANAGER */}
      <RolePermissionsManager />
    </div>
  );
}
