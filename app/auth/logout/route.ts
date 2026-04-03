import { NextResponse } from "next/server";

import { resolveNextPath } from "@/lib/auth/callback";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = resolveNextPath(requestUrl.searchParams.get("next"));
  const supabase = await createRouteHandlerClient();

  await supabase.auth.signOut();

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
