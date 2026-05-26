import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminDashboardScreen } from "@/components/admin/admin-dashboard-screen";
import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminPage() {
  return (
    <AdminShell>
      <AdminAuthGuard>
        <AdminDashboardScreen />
      </AdminAuthGuard>
    </AdminShell>
  );
}
