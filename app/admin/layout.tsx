import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import {
  createServerComponentClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

interface AdminMemberRow {
  role: string;
  user_id: string;
}

interface AdminMemberQuery {
  eq(column: string, value: string): AdminMemberQuery;
  maybeSingle(): PromiseLike<{
    data: AdminMemberRow | null;
    error: { message: string } | null;
  }>;
}

interface AdminMembersTable {
  select(columns: string): AdminMemberQuery;
}

interface AdminMembershipClient {
  from(table: "admin_members"): AdminMembersTable;
}

export const metadata = {
  title: "관리자 | 무엇을 먹든",
};

async function enforceAdminRouteAccess() {
  const serverClient = await createServerComponentClient();
  const authResult = await serverClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    notFound();
  }

  const serviceRoleClient = createServiceRoleClient() as AdminMembershipClient | null;
  if (!serviceRoleClient) {
    notFound();
  }

  try {
    const memberResult = await serviceRoleClient
      .from("admin_members")
      .select("user_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberResult.error || !memberResult.data) {
      notFound();
    }
  } catch {
    notFound();
  }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await enforceAdminRouteAccess();

  return <>{children}</>;
}
