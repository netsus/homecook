"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createAccountQuarantineIntent,
  resolveAccountQuarantine,
  type AccountQuarantineAction,
  type AccountQuarantineIntent,
} from "@/lib/api/account-quarantine";
import { isApiFetchError } from "@/lib/api/fetch-json";
import { sanitizeInternalPath } from "@/lib/navigation/return-context";

export type AccountQuarantineGateState =
  | "loading"
  | "auth-present"
  | "auth-absent"
  | "not-applicable"
  | "maintenance"
  | "pending"
  | "replay"
  | "cleanup-pending"
  | "conflict"
  | "unauthorized"
  | "error";

interface AccountQuarantineScreenProps {
  gateState: AccountQuarantineGateState;
  nextPath?: string;
}

interface LastSubmission {
  action: AccountQuarantineAction;
  nickname?: string;
}

const stateTitles: Partial<Record<AccountQuarantineGateState, string>> = {
  loading: "계정 확인 중",
  "not-applicable": "계정 확인 완료",
  maintenance: "잠시 후 다시 시도해 주세요",
  pending: "처리 중이에요",
  replay: "처리 결과를 확인했어요",
  "cleanup-pending": "계정 삭제 중",
  conflict: "다시 선택해 주세요",
  unauthorized: "다시 로그인해 주세요",
  error: "요청을 처리하지 못했어요",
};

export function AccountQuarantineScreen({
  gateState,
  nextPath = "/mypage",
}: AccountQuarantineScreenProps) {
  const router = useRouter();
  const safeNextPath = useMemo(
    () => sanitizeInternalPath(nextPath, "/mypage"),
    [nextPath],
  );
  const [viewState, setViewState] =
    useState<AccountQuarantineGateState>(gateState);
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [intent, setIntent] = useState<AccountQuarantineIntent | null>(null);
  const [lastSubmission, setLastSubmission] =
    useState<LastSubmission | null>(null);
  const [deleteReviewOpen, setDeleteReviewOpen] = useState(false);
  const leavingAccount = useRef(false);
  const deleteReviewButtonRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null);

  const closeDeleteReview = useCallback(() => {
    setDeleteReviewOpen(false);
    window.setTimeout(() => deleteReviewButtonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!deleteReviewOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelDeleteButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDeleteReview();
        return;
      }

      if (event.key === "Tab") {
        const firstTarget = cancelDeleteButtonRef.current;
        const lastTarget = confirmDeleteButtonRef.current;
        if (
          event.shiftKey
          && firstTarget
          && lastTarget
          && document.activeElement === firstTarget
        ) {
          event.preventDefault();
          lastTarget.focus();
        } else if (
          !event.shiftKey
          && firstTarget
          && lastTarget
          && document.activeElement === lastTarget
        ) {
          event.preventDefault();
          firstTarget.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDeleteReview, deleteReviewOpen]);

  function intentFor(action: AccountQuarantineAction) {
    if (intent?.action === action) {
      return intent;
    }

    const nextIntent = createAccountQuarantineIntent(action);
    setIntent(nextIntent);
    return nextIntent;
  }

  async function submitResolution(submission: LastSubmission) {
    leavingAccount.current = false;
    const nextIntent = intentFor(submission.action);
    setLastSubmission(submission);
    setDeleteReviewOpen(false);
    setViewState("pending");

    try {
      const result = await resolveAccountQuarantine({
        action: submission.action,
        idempotencyKey: nextIntent.idempotencyKey,
        ...(submission.nickname ? { nickname: submission.nickname } : {}),
      });

      if (leavingAccount.current) return;

      if ("resolution_status" in result) {
        router.replace(safeNextPath);
        return;
      }

      setViewState("cleanup-pending");
    } catch (error) {
      if (leavingAccount.current) return;
      if (!isApiFetchError(error)) {
        setViewState("error");
        return;
      }

      if (
        error.status === 401
        || error.code === "ACCOUNT_SESSION_STALE"
        || error.code === "ACCOUNT_GENERATION_STALE"
      ) {
        setViewState("unauthorized");
        return;
      }

      if (error.code === "ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED") {
        setViewState("auth-absent");
        return;
      }

      if (error.code === "ACCOUNT_LIFECYCLE_MAINTENANCE") {
        setViewState("maintenance");
        return;
      }

      if (error.code === "IDEMPOTENCY_KEY_REUSED") {
        setViewState("conflict");
        return;
      }

      if (
        error.code === "ACCOUNT_DELETING"
        || error.code === "ACCOUNT_DELETION_PENDING"
      ) {
        setViewState("cleanup-pending");
        return;
      }

      setViewState("error");
    }
  }

  const submitRecovery = async () => {
    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length < 2 || trimmedNickname.length > 30) {
      setNicknameError("닉네임은 2~30자로 입력해 주세요.");
      return;
    }

    setNicknameError(null);
    await submitResolution({
      action: "activate",
      nickname: trimmedNickname,
    });
  };

  const submitDelete = async () => {
    await submitResolution({ action: "delete" });
  };

  const resetConflict = () => {
    setIntent(null);
    setLastSubmission(null);
    setViewState("auth-present");
  };

  const retry = () => {
    if (!lastSubmission) {
      window.location.reload();
      return;
    }

    if (lastSubmission.action === "delete") {
      setViewState("auth-present");
      return;
    }

    void submitResolution(lastSubmission);
  };

  const isAuthPresent = viewState === "auth-present";
  const switchAccountPath = `/auth/logout?reauthenticate=1&next=${encodeURIComponent(safeNextPath)}`;

  return (
    <main
      className="min-h-screen bg-[var(--surface-fill)] px-4 pb-[calc(var(--space-8)+env(safe-area-inset-bottom))] pt-[calc(var(--space-6)+env(safe-area-inset-top))] text-[var(--foreground)] sm:px-6"
      data-screen-id="ACCOUNT_QUARANTINE"
    >
      <section
        aria-hidden={deleteReviewOpen || undefined}
        className="mx-auto w-full max-w-[480px] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)] sm:p-6"
        data-testid="account-quarantine-background"
        inert={deleteReviewOpen || undefined}
      >
        {isAuthPresent ? (
          <>
            <h1 className="text-2xl font-extrabold">계정 복구</h1>
            <label className="mt-6 block text-sm font-bold" htmlFor="account-quarantine-nickname">
              닉네임
            </label>
            <input
              aria-describedby={nicknameError ? "account-quarantine-nickname-error" : undefined}
              aria-invalid={nicknameError ? true : undefined}
              autoComplete="nickname"
              className="mt-2 min-h-[var(--control-height-lg)] w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-base outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
              id="account-quarantine-nickname"
              maxLength={30}
              onChange={(event) => {
                setNickname(event.target.value);
                setNicknameError(null);
              }}
              placeholder="닉네임 2~30자"
              value={nickname}
            />
            {nicknameError ? (
              <p className="mt-2 text-sm text-[var(--danger-strong)]" id="account-quarantine-nickname-error" role="alert">
                {nicknameError}
              </p>
            ) : null}
            <button
              className="mt-4 min-h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] bg-[var(--brand-primary-text)] px-4 text-base font-bold text-[var(--text-inverse)]"
              data-variant="primary"
              onClick={() => void submitRecovery()}
              type="button"
            >
              계정 복구
            </button>
            <button
              className="mt-3 min-h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] border border-[var(--danger-border)] px-4 text-sm font-bold text-[var(--danger-strong)]"
              data-variant="secondary"
              onClick={() => {
                intentFor("delete");
                setDeleteReviewOpen(true);
              }}
              ref={deleteReviewButtonRef}
              type="button"
            >
              계정 삭제
            </button>
          </>
        ) : viewState === "auth-absent" ? (
          <>
            <h1 className="text-2xl font-extrabold">계정 확인이 필요해요</h1>
            <p className="mt-3 text-sm text-[var(--text-2)]">복구는 고객지원에 문의해 주세요.</p>
          </>
        ) : (
          <div aria-busy={viewState === "loading" || viewState === "pending"} aria-live="polite">
            <h1 className="text-2xl font-extrabold">{stateTitles[viewState]}</h1>
            {viewState === "pending" ? (
              <button className="mt-5 min-h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-4 text-sm text-[var(--text-3)]" disabled type="button">
                처리 중
              </button>
            ) : null}
            {viewState === "not-applicable" ? (
              <Link className="mt-5 flex min-h-[var(--control-height-lg)] items-center justify-center font-bold text-[var(--brand-primary-text)]" href={safeNextPath}>
                원래 화면으로 이동
              </Link>
            ) : null}
            {viewState === "conflict" ? (
              <button className="mt-5 min-h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] border border-[var(--line)] px-4 font-bold" onClick={resetConflict} type="button">
                다시 선택
              </button>
            ) : null}
            {viewState === "error" ? (
              <button className="mt-5 min-h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] border border-[var(--line)] px-4 font-bold" onClick={retry} type="button">
                다시 시도
              </button>
            ) : null}
          </div>
        )}
        {/* A full navigation clears the browser client too; never prefetch logout. */}
        <a
          className="mt-5 flex min-h-11 items-center justify-center text-sm font-bold text-[var(--brand-primary-text)] underline underline-offset-4"
          href={switchAccountPath}
          onClick={(event) => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
              leavingAccount.current = true;
            }
          }}
        >
          다른 계정으로 로그인
        </a>
      </section>

      {deleteReviewOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-42)] p-0 sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDeleteReview();
            }
          }}
        >
          <section
            aria-labelledby="account-quarantine-delete-title"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-[520px] overscroll-contain overflow-y-auto rounded-t-[var(--radius-sheet)] bg-[var(--surface)] p-5 pb-[calc(var(--space-6)+env(safe-area-inset-bottom))] shadow-[var(--shadow-modal)] sm:rounded-[var(--radius-sheet)] sm:p-6"
            role="dialog"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-4 h-1 w-12 rounded-full bg-[var(--line-strong)] sm:hidden"
            />
            <h2
              className="text-xl font-extrabold"
              id="account-quarantine-delete-title"
            >
              정말 계정을 삭제할까요?
            </h2>
            <p className="mt-4 text-sm leading-6 text-[var(--text-2)]">
              개인 레시피·식사 기록·남은 요리·비공개 이미지는 삭제돼요.
              공개 레시피·등록 식품은 작성자 정보 없이 남을 수 있어요.
            </p>
            <div className="mt-6 grid gap-3 min-[380px]:grid-cols-2">
              <button
                className="min-h-[var(--control-height-lg)] rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-sm font-extrabold"
                onClick={closeDeleteReview}
                ref={cancelDeleteButtonRef}
                type="button"
              >
                취소
              </button>
              <button
                className="min-h-[var(--control-height-lg)] rounded-[var(--radius-control)] bg-[var(--danger-strong)] px-4 text-sm font-extrabold text-[var(--text-inverse)]"
                onClick={() => void submitDelete()}
                ref={confirmDeleteButtonRef}
                type="button"
              >
                삭제 시작
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
