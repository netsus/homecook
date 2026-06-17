import Link from "next/link";
import React from "react";

import { WebShell, WebTopNav } from "@/components/web";

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export default function NotFound() {
  return (
    <WebShell className="web-not-found-shell" wide>
      <WebTopNav activeId="home" items={WEB_NAV_ITEMS} />
      <main className="not-found-screen">
        <p className="not-found-kicker">404</p>
        <h1>페이지를 찾을 수 없어요</h1>
        <p>
          주소가 바뀌었거나 더 이상 제공하지 않는 화면이에요. 홈에서 레시피를
          다시 찾거나 플래너로 이동해 주세요.
        </p>
        <div className="not-found-actions">
          <Link className="web-button web-button-primary" href="/">
            홈으로
          </Link>
          <Link className="web-button web-button-secondary" href="/planner">
            플래너로
          </Link>
        </div>
      </main>
    </WebShell>
  );
}
