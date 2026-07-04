import { proxyOAuthUserinfo } from "@/lib/auth/oauth-userinfo-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyOAuthUserinfo(request, "kakao");
}
