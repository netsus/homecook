import Link from "next/link";
import * as React from "react";

interface AppHeaderProps {
  brandAsPageTitle?: boolean;
}

export function AppHeader({ brandAsPageTitle = false }: AppHeaderProps) {
  const brandLink = (
    <Link
      aria-label="Homecook"
      className="inline-flex text-[22px] font-bold leading-none transition-opacity hover:opacity-80 [font-family:var(--wave1-font-brand)]"
      href="/"
    >
      <span className="text-[var(--wave1-mint-contrast)]">homecook</span>
      <span className="text-[var(--wave1-ink)]">_</span>
    </Link>
  );

  return (
    <header
      className="sticky top-0 z-20 border-b border-[var(--wave1-border)] bg-[var(--wave1-surface)]"
      style={{ borderBottomWidth: "0.5px" }}
    >
      <div className="flex min-h-[52px] items-center justify-center px-4 md:min-h-[56px] md:px-6">
        {brandAsPageTitle ? <h1>{brandLink}</h1> : brandLink}
      </div>
    </header>
  );
}
