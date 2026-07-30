import { NextResponse } from "next/server";

import { resolveNextPath } from "@/lib/auth/callback";
import { resolvePublicRequestUrl } from "@/lib/auth/public-request-url";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = resolvePublicRequestUrl(new URL(request.url));
  const nextPath = resolveNextPath(requestUrl.searchParams.get("next"));
  const supabase = await createRouteHandlerClient();

  await supabase.auth.signOut();

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
