import { NextResponse, type NextRequest } from "next/server";

const privacyHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export const config = { matcher: ["/beta/:path*"] };

/** Validate before Next decodes dynamic params, so encoded aliases cannot choose a topic. */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch { /* Invalid r2 input is rejected below. */ }
  if (!(decoded === "/beta/r2" || decoded.startsWith("/beta/r2/"))) return NextResponse.next();
  if (pathname === "/beta/r2/recording" || pathname === "/beta/r2/homeflow") return NextResponse.next();
  if (pathname === "/beta/r2/recording/" || pathname === "/beta/r2/homeflow/") {
    const canonical = new URL(request.url);
    canonical.pathname = pathname.slice(0, -1);
    return NextResponse.redirect(canonical, { status: 308, headers: privacyHeaders });
  }
  return new NextResponse(null, { status: 404, headers: privacyHeaders });
}
