import Link from "next/link";
import * as React from "react";

interface AppHeaderProps {
  brandAsPageTitle?: boolean;
}

export function AppHeader({ brandAsPageTitle = false }: AppHeaderProps) {
  const brandLink = (
    <Link
      className="inline-flex text-[1rem] font-black uppercase tracking-[0.22em] text-[var(--foreground)] transition hover:text-[var(--brand-deep)] md:text-[1.12rem]"
      href="/"
    >
      Homecook
    </Link>
  );

  return (
    <header className="glass-panel overflow-hidden rounded-[24px] md:rounded-[32px]">
      <div className="flex items-center justify-between gap-3 px-[clamp(1rem,4vw,1.25rem)] py-[clamp(0.75rem,3vw,0.875rem)] md:px-7 md:py-4">
        {brandAsPageTitle ? <h1>{brandLink}</h1> : brandLink}
      </div>
    </header>
  );
}
