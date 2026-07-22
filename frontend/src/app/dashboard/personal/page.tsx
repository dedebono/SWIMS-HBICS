"use client";

import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PersonalDashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Halo, {user?.full_name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dashboard Personal akan segera hadir.
        </p>
      </div>

      <Card className="glass shadow-sm">
        <CardHeader>
          <CardTitle>Profil Saya</CardTitle>
          <CardDescription>Informasi akun personal Anda.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Nama: </span>
            {user?.full_name}
          </div>
          <div>
            <span className="text-muted-foreground">Email: </span>
            {user?.email}
          </div>
          <div>
            <span className="text-muted-foreground">Role: </span>
            {user?.role.replace("_", " ")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
