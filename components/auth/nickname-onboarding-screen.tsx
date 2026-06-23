"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useViewMode } from "@/components/shared/use-view-mode";
import { WebShell, WebTopNav } from "@/components/web";
import {
  fetchUserProfile,
  isMypageApiError,
  updateNickname,
} from "@/lib/api/mypage";
import { sanitizeInternalPath } from "@/lib/navigation/return-context";

interface NicknameOnboardingScreenProps {
  nextPath?: string;
}

type ScreenState = "loading" | "ready" | "error";

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

function buildLoginPath(nextPath: string) {
  const onboardingPath = `/onboarding/nickname?next=${encodeURIComponent(nextPath)}`;

  return `/login?next=${encodeURIComponent(onboardingPath)}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (isMypageApiError(error)) {
    return error.message;
  }

  return fallback;
}

export function NicknameOnboardingScreen({
  nextPath = "/",
}: NicknameOnboardingScreenProps) {
  const router = useRouter();
  const viewMode = useViewMode();
  const safeNextPath = useMemo(
    () => sanitizeInternalPath(nextPath, "/"),
    [nextPath],
  );
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [nickname, setNickname] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    setScreenState("loading");
    setErrorMessage(null);

    void fetchUserProfile()
      .then((profile) => {
        if (!mounted) {
          return;
        }

        const currentNickname = profile.nickname.trim();
        if (currentNickname.length >= 2) {
          router.replace(safeNextPath);
          return;
        }

        setNickname(currentNickname);
        setScreenState("ready");
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }

        if (isMypageApiError(error) && error.status === 401) {
          router.replace(buildLoginPath(safeNextPath));
          return;
        }

        setErrorMessage(getErrorMessage(error, "내 정보를 불러오지 못했어요."));
        setScreenState("error");
      });

    return () => {
      mounted = false;
    };
  }, [router, safeNextPath]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmed = nickname.trim();
      if (trimmed.length < 2 || trimmed.length > 30) {
        setErrorMessage("닉네임은 2~30자로 입력해 주세요.");
        return;
      }

      setIsSaving(true);
      setErrorMessage(null);

      try {
        await updateNickname(trimmed);
        router.replace(safeNextPath);
      } catch (error) {
        if (isMypageApiError(error) && error.status === 401) {
          router.replace(buildLoginPath(safeNextPath));
          return;
        }

        setErrorMessage(getErrorMessage(error, "닉네임을 저장하지 못했어요."));
      } finally {
        setIsSaving(false);
      }
    },
    [nickname, router, safeNextPath],
  );

  const form = (
    <section
      className="mx-auto flex w-full max-w-[430px] flex-col px-6 text-center"
      data-testid="nickname-onboarding-card"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[var(--radius-card)] bg-[var(--brand-soft)] text-[var(--brand)] shadow-[var(--shadow-1)]">
        <UserIcon />
      </div>
      <p className="mx-auto mt-4 inline-flex rounded-[var(--radius-full)] bg-[var(--brand-soft)] px-3 py-1 text-[12px] font-extrabold tracking-[0.08em] text-[var(--brand)]">
        집밥
      </p>
      <h1 className="mt-5 text-[26px] font-bold leading-[1.35] text-[var(--foreground)]">
        닉네임을 정해 주세요
      </h1>
      <p
        className="mx-auto mt-3 max-w-[310px] text-[14px] font-medium leading-6 text-[var(--text-3)]"
        data-testid="nickname-onboarding-description"
      >
        <span className="block">레시피와 플래너에서 사용할 이름이에요.</span>
        <span className="block">나중에 마이페이지에서 바꿀 수 있어요.</span>
      </p>

      <form className="mt-7 text-left" onSubmit={handleSubmit}>
        <label
          className="mb-2 block text-[13px] font-bold text-[var(--foreground)]"
          htmlFor="nickname-onboarding-input"
        >
          닉네임
        </label>
        <input
          aria-describedby="nickname-onboarding-help"
          aria-invalid={errorMessage ? true : undefined}
          autoComplete="nickname"
          className="h-[var(--input-height)] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[15px] font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
          id="nickname-onboarding-input"
          maxLength={30}
          onChange={(event) => {
            setNickname(event.target.value);
            setErrorMessage(null);
          }}
          placeholder="예: 집밥러"
          value={nickname}
        />
        <p
          className="mt-2 text-[12px] font-medium leading-5 text-[var(--text-3)]"
          id="nickname-onboarding-help"
        >
          2~30자로 입력해 주세요.
        </p>
        {errorMessage ? (
          <p className="mt-3 rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-[13px] font-bold text-[var(--danger)]">
            {errorMessage}
          </p>
        ) : null}
        <button
          className="mt-5 flex h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-[15px] font-bold text-[var(--text-inverse)] shadow-[0_4px_12px_var(--brand-shadow-color)] transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          style={{ color: "var(--text-inverse)" }}
          type="submit"
        >
          {isSaving ? "저장 중..." : "시작하기"}
        </button>
      </form>
    </section>
  );

  const loadingSkeleton = (
    <section
      aria-label="닉네임 화면 준비 중"
      className="mx-auto flex w-full max-w-[430px] flex-col px-6"
      data-testid="nickname-onboarding-skeleton"
    >
      <div className="mx-auto h-12 w-12 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-fill)]" />
      <div className="mx-auto mt-4 h-6 w-16 animate-pulse rounded-[var(--radius-full)] bg-[var(--surface-fill)]" />
      <div className="mx-auto mt-5 h-9 w-56 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-fill)]" />
      <div className="mx-auto mt-3 grid w-full max-w-[310px] gap-2">
        <div className="h-4 animate-pulse rounded-[var(--radius-full)] bg-[var(--surface-fill)]" />
        <div className="mx-auto h-4 w-4/5 animate-pulse rounded-[var(--radius-full)] bg-[var(--surface-fill)]" />
      </div>
      <div className="mt-7 grid gap-2">
        <div className="h-4 w-14 animate-pulse rounded-[var(--radius-full)] bg-[var(--surface-fill)]" />
        <div className="h-[var(--input-height)] animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-fill)]" />
        <div className="h-[var(--control-height-lg)] animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-fill)]" />
      </div>
    </section>
  );

  const errorContent = (
    <section className="mx-auto w-full max-w-[430px] px-6 text-center">
      <div className="mx-auto h-12 w-12 animate-pulse rounded-[var(--radius-card)] bg-[var(--brand-soft)]" />
      <h1 className="mt-5 text-[22px] font-bold text-[var(--foreground)]">
        닉네임 화면을 열지 못했어요
      </h1>
      <p className="mx-auto mt-3 max-w-[310px] text-[14px] font-medium leading-6 text-[var(--text-3)]">
        {errorMessage ?? "잠시 후 다시 시도해 주세요."}
      </p>
      <button
        className="mx-auto mt-5 flex h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--brand)] px-5 text-[14px] font-bold text-[var(--brand)]"
        onClick={() => {
          setScreenState("loading");
          window.location.reload();
        }}
        type="button"
      >
        다시 시도
      </button>
    </section>
  );

  const content =
    screenState === "ready"
      ? form
      : screenState === "error"
      ? errorContent
      : loadingSkeleton;

  if (viewMode === "web") {
    return (
      <WebShell className="web-login-shell">
        <WebTopNav activeId="login" items={WEB_NAV_ITEMS} />
        <main className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[var(--surface-fill)] px-6 py-12 text-[var(--foreground)]">
          {content}
        </main>
      </WebShell>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] py-[calc(32px+env(safe-area-inset-top))] text-[var(--foreground)]">
      {content}
    </main>
  );
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}
