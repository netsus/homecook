import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminEventsScreen } from "@/components/admin/admin-events-screen";
import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminEventsPage() {
  return (
    <AdminShell>
      <AdminAuthGuard>
        <AdminEventsScreen />
      </AdminAuthGuard>
    </AdminShell>
  );
}
