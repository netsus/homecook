import Link from "next/link";
import React from "react";

import { NotFoundFeedbackForm } from "@/components/feedback/not-found-feedback-form";
import { BottomTabs } from "@/components/layout/bottom-tabs";
import { WebShell, WebTopNav } from "@/components/web";

export default function NotFound() {
  return (
    <WebShell className="web-not-found-shell" wide>
      <WebTopNav activeId="home" className="not-found-desktop-nav" />
      <main className="not-found-screen">
        <p className="not-found-kicker">404</p>
        <h1>페이지를 찾을 수 없어요</h1>
        <p>주소가 바뀌었어요. 홈에서 다시 찾아보세요.</p>
        <div className="not-found-actions">
          <Link className="web-button web-button-primary" href="/">
            홈으로
          </Link>
          <Link className="web-button web-button-secondary" href="/planner">
            플래너로
          </Link>
        </div>
        <NotFoundFeedbackForm />
      </main>
      <div className="not-found-mobile-tabs">
        <BottomTabs currentTab="home" />
      </div>
    </WebShell>
  );
}
