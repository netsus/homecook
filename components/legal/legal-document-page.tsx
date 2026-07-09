import Link from "next/link";
import React from "react";

import { WebShell, WebTopNav } from "@/components/web";

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "privacy", href: "/privacy", label: "개인정보" },
  { id: "terms", href: "/terms", label: "약관" },
] as const;

interface LegalDocumentPageProps {
  activeId: "privacy" | "terms";
  children: React.ReactNode;
  description: string;
  eyebrow: string;
  meta: Array<{
    label: string;
    value: React.ReactNode;
  }>;
  title: string;
}

export function LegalDocumentPage({
  activeId,
  children,
  description,
  eyebrow,
  meta,
  title,
}: LegalDocumentPageProps) {
  return (
    <WebShell className="legal-shell" wide>
      <WebTopNav
        activeId={activeId}
        className="legal-desktop-nav"
        items={WEB_NAV_ITEMS}
      />
      <header className="legal-mobile-header">
        <Link className="legal-mobile-brand" href="/">
          집밥
        </Link>
        <Link className="legal-mobile-home" href="/">
          홈
        </Link>
      </header>
      <main className="legal-page">
        <section className="legal-hero" aria-labelledby="legal-page-title">
          <p className="legal-eyebrow">{eyebrow}</p>
          <h1 id="legal-page-title">{title}</h1>
          <p>{description}</p>
        </section>
        <div className="legal-layout">
          <aside className="legal-meta" aria-label="문서 기본 정보">
            {meta.map((item) => (
              <div className="legal-meta-row" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </aside>
          <article className="legal-document">{children}</article>
        </div>
      </main>
    </WebShell>
  );
}
