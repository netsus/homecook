import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminUsersScreen } from "@/components/admin/admin-users-screen";

export default function AdminUsersPage() {
  return (
    <AdminShell>
      <AdminAuthGuard>
        <AdminUsersScreen />
      </AdminAuthGuard>
    </AdminShell>
  );
}
