import Link from "next/link";

const tabs = [
  { id: "home", label: "홈", href: "/" },
  { id: "planner", label: "플래너", href: "/planner" },
  { id: "pantry", label: "팬트리", href: "/pantry" },
  { id: "mypage", label: "마이", href: "/mypage" },
] as const;

interface BottomTabsProps {
  currentTab: (typeof tabs)[number]["id"];
  compactOnNarrow?: boolean;
}

export function BottomTabs({
  compactOnNarrow = false,
  currentTab,
}: BottomTabsProps) {
  const compactNavClass = compactOnNarrow ? " max-[360px]:px-3 max-[360px]:pb-3" : "";
  const compactPanelClass = compactOnNarrow ? " max-[360px]:py-1" : "";
  const compactLinkClass = compactOnNarrow ? " max-[360px]:px-2 max-[360px]:py-1" : "";
  const compactTopLabelClass = compactOnNarrow ? " max-[360px]:text-[11px]" : "";
  const compactBottomLabelClass = compactOnNarrow
    ? " max-[360px]:mt-0.5 max-[360px]:text-[10px]"
    : "";

  return (
    <nav className={`fixed inset-x-0 bottom-0 z-30 px-4 pb-4${compactNavClass}`}>
      <div
        className={`glass-panel mx-auto flex max-w-md items-center justify-between rounded-[26px] px-2 py-2${compactPanelClass}`}
      >
        {tabs.map((tab) => {
          const active = tab.id === currentTab;

          return (
            <Link
              key={tab.id}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center rounded-[18px] px-3 py-2 text-sm transition${compactLinkClass} ${
                active
                  ? "bg-[var(--brand)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:bg-white/60"
              }`}
              href={tab.href}
              prefetch={false}
            >
              <span className={`text-xs uppercase tracking-[0.22em]${compactTopLabelClass}`}>
                {tab.label}
              </span>
              <span className={`mt-1 text-[11px]${compactBottomLabelClass}`}>
                {active ? "현재" : "준비중"}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
