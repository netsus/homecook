import Link from "next/link";

const tabs = [
  { id: "home", label: "홈", href: "/" },
  { id: "planner", label: "플래너", href: "#" },
  { id: "pantry", label: "팬트리", href: "#" },
  { id: "mypage", label: "마이", href: "#" },
] as const;

interface BottomTabsProps {
  currentTab: (typeof tabs)[number]["id"];
}

export function BottomTabs({ currentTab }: BottomTabsProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4">
      <div className="glass-panel mx-auto flex max-w-md items-center justify-between rounded-[26px] px-2 py-2">
        {tabs.map((tab) => {
          const active = tab.id === currentTab;

          return (
            <Link
              key={tab.id}
              aria-disabled={!active && tab.href === "#"}
              className={`flex min-w-0 flex-1 flex-col items-center rounded-[18px] px-3 py-2 text-sm transition ${
                active
                  ? "bg-[var(--brand)] text-white"
                  : "text-[var(--muted)] hover:bg-white/60"
              }`}
              href={tab.href}
            >
              <span className="text-xs uppercase tracking-[0.22em]">
                {tab.label}
              </span>
              <span className="mt-1 text-[11px]">
                {active ? "현재" : "준비중"}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
