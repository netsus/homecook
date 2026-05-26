import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminAuditLogsScreen } from "@/components/admin/admin-audit-logs-screen";
import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminAuditLogsPage() {
  return (
    <AdminShell>
      <AdminAuthGuard>
        <AdminAuditLogsScreen />
      </AdminAuthGuard>
    </AdminShell>
  );
}
