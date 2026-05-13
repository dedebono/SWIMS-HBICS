"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { Building, Lock, Mail, User } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    tenant_name: "",
    slug: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await apiClient<{ tenantId: string }>("/onboarding/register", {
        method: "POST",
        body: formData,
      });
      
      if (response.success) {
        toast.success("Registration successful! Welcome to SWIMS.");
        router.push("/login");
      } else {
        toast.error(response.error || "Registration failed. Please try again.");
      }
    } catch (error: any) {
      toast.error("Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <Card className="w-full max-w-lg shadow-xl border-zinc-200 dark:border-zinc-800">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Join SWIMS
          </CardTitle>
          <CardDescription className="text-zinc-500 dark:text-zinc-400">
            Register your institution and set up the IT Administrator account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tenant_name">Institution Name</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    id="tenant_name"
                    name="tenant_name"
                    placeholder="e.g. Springfield High School"
                    required
                    className="pl-9"
                    value={formData.tenant_name}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Institution Slug</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    id="slug"
                    name="slug"
                    placeholder="e.g. springfield-high"
                    required
                    className="pl-9"
                    value={formData.slug}
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                      setFormData(prev => ({ ...prev, slug: val }));
                    }}
                  />
                </div>
                <p className="text-xs text-zinc-500">This will be used for your unique login URL.</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="admin_name">IT Admin Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    id="admin_name"
                    name="admin_name"
                    placeholder="John Doe"
                    required
                    className="pl-9"
                    value={formData.admin_name}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_email">IT Admin Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    id="admin_email"
                    name="admin_email"
                    type="email"
                    placeholder="admin@school.edu"
                    required
                    className="pl-9"
                    value={formData.admin_email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_password">Admin Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    id="admin_password"
                    name="admin_password"
                    type="password"
                    required
                    className="pl-9"
                    value={formData.admin_password}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Creating Account..." : "Register Institution"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center text-sm text-zinc-500">
          Already have an account? <Button variant="link" className="p-1 h-auto" onClick={() => router.push('/login')}>Log in</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
