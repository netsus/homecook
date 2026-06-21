import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminFeedbackScreen } from "@/components/admin/admin-feedback-screen";
import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminFeedbackPage() {
  return (
    <AdminShell>
      <AdminAuthGuard>
        <AdminFeedbackScreen />
      </AdminAuthGuard>
    </AdminShell>
  );
}
