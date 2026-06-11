"use client";

import React, { useEffect, useRef } from "react";

import { GrowthBadgeIcon } from "@/components/mypage/growth-badge-icon";
import type {
  UserGamificationBadgeData,
  UserGamificationData,
} from "@/types/user-gamification";

const XP_ACTIONS = [
  ["레시피 저장", "첫 +15 XP"],
  ["레시피북 생성", "첫 +25 XP"],
  ["장보기 완료", "첫 +40 XP"],
  ["요리 완료", "첫 +60 XP"],
  ["플래너 등록", "첫 +25 XP"],
] as const;

function pickEarnedBadges(data: UserGamificationData | null) {
  if (!data) return [];
  return data.badges.earned.length > 0 ? data.badges.earned : data.featured_badges;
}

function BadgeGuideRow({
  badge,
  earned,
}: {
  badge: UserGamificationBadgeData;
  earned: boolean;
}) {
  return (
    <li className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-3 py-2">
      <GrowthBadgeIcon
        earned={earned}
        shapeKey={badge.shape_key}
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-extrabold leading-[1.3] text-[var(--foreground)]">
          {badge.label}
        </span>
        <span
          className="block text-[11px] font-semibold leading-[1.35] text-[var(--text-2)]"
          data-testid={earned ? undefined : "mypage-locked-badge-hint"}
        >
          {earned ? badge.description : badge.locked_hint ?? badge.description}
        </span>
      </span>
    </li>
  );
}

export function MypageBadgeGuideDialog({
  data,
  onClose,
}: {
  data: UserGamificationData | null;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const earnedBadges = pickEarnedBadges(data);
  const lockedBadges = data?.badges.locked ?? [];

  useEffect(() => {
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--overlay-40)] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-10 md:items-center md:pb-10"
      data-testid="mypage-badge-guide-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="badge-guide-title"
        aria-modal="true"
        className="max-h-[min(720px,calc(100vh-48px))] w-full max-w-[460px] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_20px_60px_var(--overlay-30)]"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              className="text-[17px] font-extrabold leading-[1.3] text-[var(--foreground)]"
              id="badge-guide-title"
            >
              배지 안내
            </h2>
            <p className="mt-1 text-[12px] font-semibold leading-[1.45] text-[var(--text-2)]">
              활동을 기록하면 배지와 퀘스트가 자동으로 쌓여요.
            </p>
          </div>
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-fill)] text-[18px] font-extrabold text-[var(--text-2)]"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {XP_ACTIONS.map(([label, xp]) => (
            <div
              className="flex min-h-9 items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-3 text-[12px] font-bold"
              key={label}
            >
              <span className="truncate">{label}</span>
              <strong className="text-[var(--brand)]">{xp}</strong>
            </div>
          ))}
        </div>

        <p className="mt-2 text-[11px] font-semibold leading-[1.45] text-[var(--text-3)]">
          첫 경험치 기준이에요. 같은 활동을 반복하면 경험치가 조금 더 작게 쌓여요.
        </p>

        <div className="mt-4">
          <p className="text-[12px] font-extrabold text-[var(--foreground)]">
            획득 배지
          </p>
          {earnedBadges.length > 0 ? (
            <ul className="mt-2 grid gap-2 min-[360px]:grid-cols-2">
              {earnedBadges.map((badge) => (
                <BadgeGuideRow
                  badge={badge}
                  earned
                  key={badge.badge_key}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-3 text-[11px] font-semibold leading-[1.4] text-[var(--text-2)]">
              첫 저장, 첫 장보기, 첫 요리에서 배지가 시작돼요.
            </p>
          )}
        </div>

        {lockedBadges.length > 0 ? (
          <div className="mt-4">
            <p className="text-[12px] font-extrabold text-[var(--foreground)]">
              다음에 열 수 있는 배지
            </p>
            <ul className="mt-2 grid gap-2 min-[360px]:grid-cols-2">
              {lockedBadges.map((badge) => (
                <BadgeGuideRow
                  badge={badge}
                  earned={false}
                  key={badge.badge_key}
                />
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-4 text-[11px] font-semibold leading-[1.45] text-[var(--text-3)]">
          순위, 압박형 연속 출석, 랜덤 보상은 쓰지 않아요. 집밥 루틴을 조용히
          기록하는 용도예요.
        </p>
      </section>
    </div>
  );
}
