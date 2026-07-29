import { NextResponse } from "next/server";

import { resolveNextPath } from "@/lib/auth/callback";
import { revokeCurrentHybridSessionAuthority } from "@/lib/server/hybrid-auth/logout";
import { createAuthRouteHandlerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = resolveNextPath(requestUrl.searchParams.get("next"));
  const supabase = await createAuthRouteHandlerClient();

  await revokeCurrentHybridSessionAuthority(supabase);
  await supabase.auth.signOut({ scope: "local" });

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
