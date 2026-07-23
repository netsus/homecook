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

const staticStateCopy: Partial<Record<
  AccountQuarantineGateState,
  { title: string; description: string }
>> = {
  loading: {
    title: "계정 상태를 확인하고 있어요",
    description: "확인이 끝날 때까지 계정 동작을 잠시 멈춰 둘게요.",
  },
  "not-applicable": {
    title: "계정 보호 화면이 필요하지 않아요",
    description: "원래 보려던 화면으로 안전하게 돌아갈 수 있어요.",
  },
  maintenance: {
    title: "지금은 계정 전환 작업 중이에요",
    description: "작업이 끝난 뒤 이 화면을 다시 열어 주세요.",
  },
  pending: {
    title: "처리 중이에요. 잠시만 기다려 주세요.",
    description: "같은 요청을 다시 보내지 않고 현재 결과를 기다리고 있어요.",
  },
  replay: {
    title: "이전 요청 결과를 다시 보여드려요",
    description: "새 요청을 만들지 않고 이미 저장된 결과를 확인했어요.",
  },
  "cleanup-pending": {
    title: "계정 정리를 시작했어요. 아직 완료되지 않았어요.",
    description: "개인 정보와 연결된 항목을 안전하게 정리하고 있어요.",
  },
  conflict: {
    title: "요청 내용이 달라서 처리할 수 없어요",
    description: "이전 요청을 덮어쓰지 않고 새로 검토해야 해요.",
  },
  unauthorized: {
    title: "세션이 바뀌었어요. 다시 로그인해 주세요.",
    description: "로그인 뒤 같은 계정 보호 화면으로 돌아올게요.",
  },
  error: {
    title: "요청을 처리하지 못했어요",
    description: "안전하게 멈췄어요. 잠시 후 다시 시도해 주세요.",
  },
};

function buildLoginPath(nextPath: string) {
  const quarantinePath =
    `/account-quarantine?next=${encodeURIComponent(nextPath)}`;
  return `/login?next=${encodeURIComponent(quarantinePath)}`;
}

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

      if ("resolution_status" in result) {
        router.replace(safeNextPath);
        return;
      }

      setViewState("cleanup-pending");
    } catch (error) {
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

  const statusContent = staticStateCopy[viewState];
  const isAuthPresent = viewState === "auth-present";
  const isAuthAbsent = viewState === "auth-absent";

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-[var(--surface-fill)] px-4 pb-[calc(var(--space-8)+env(safe-area-inset-bottom))] pt-[calc(var(--space-6)+env(safe-area-inset-top))] text-[var(--foreground)] sm:px-6"
      data-screen-id="ACCOUNT_QUARANTINE"
    >
      <div
        aria-hidden={deleteReviewOpen || undefined}
        className="mx-auto w-full max-w-[960px]"
        data-testid="account-quarantine-background"
        inert={deleteReviewOpen || undefined}
      >
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0 rounded-[var(--radius-card)] border border-[var(--warning-border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)] sm:p-6">
            <span className="inline-flex min-h-8 items-center rounded-[var(--radius-full)] bg-[var(--warning-soft)] px-3 text-xs font-extrabold text-[var(--foreground)]">
              계정 보호
            </span>

            {isAuthPresent ? (
              <>
                <h1 className="mt-4 text-[24px] font-extrabold leading-[1.35]">
                  계정 보호 중
                </h1>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-2)]">
                  일반 마이페이지는 열리지 않아요.
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">
                  본인 확인 후 복구하거나 삭제를 검토할 수 있어요.
                </p>

                <div className="mt-5 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface-fill)] p-4">
                  <p className="text-sm font-bold">본인 확인</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-3)]">
                    로그인 상태와 계정 연결을 안전하게 다시 확인해요.
                  </p>
                </div>

                <div className="mt-4 rounded-[var(--radius-panel)] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] p-4">
                  <label
                    className="text-sm font-bold"
                    htmlFor="account-quarantine-nickname"
                  >
                    복구할 계정의 닉네임
                  </label>
                  <input
                    aria-describedby="account-quarantine-nickname-help"
                    aria-invalid={nicknameError ? true : undefined}
                    autoComplete="nickname"
                    className="mt-2 min-h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[15px] font-semibold outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
                    id="account-quarantine-nickname"
                    maxLength={30}
                    onChange={(event) => {
                      setNickname(event.target.value);
                      setNicknameError(null);
                    }}
                    placeholder="예: 무먹러"
                    value={nickname}
                  />
                  <p
                    className="mt-2 text-xs leading-5 text-[var(--text-3)]"
                    id="account-quarantine-nickname-help"
                  >
                    복구된 계정에서 사용할 이름을 2~30자로 입력해 주세요.
                  </p>
                  {nicknameError ? (
                    <p
                      className="mt-2 text-xs font-bold text-[var(--danger-strong)]"
                      role="alert"
                    >
                      {nicknameError}
                    </p>
                  ) : null}
                  <button
                    className="mt-4 flex min-h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand-primary-text)] px-4 text-[15px] font-extrabold text-[var(--text-inverse)]"
                    data-variant="primary"
                    onClick={() => void submitRecovery()}
                    type="button"
                  >
                    계정 복구
                  </button>
                </div>

                <div className="mt-5 rounded-[var(--radius-panel)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4">
                  <h2 className="text-sm font-extrabold text-[var(--danger-strong)]">
                    삭제 검토
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-[var(--text-2)]">
                    공개한 사용자 등록 완제품과 공개 레시피는 작성자 정보 없이
                    보존될 수 있어요. 개인 레시피, 식사 기록, 배치, 비공개
                    이미지는 삭제 대상이에요.
                  </p>
                  <button
                    className="mt-4 flex min-h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--surface)] px-4 text-[15px] font-extrabold text-[var(--danger-strong)]"
                    data-variant="secondary"
                    onClick={() => {
                      intentFor("delete");
                      setDeleteReviewOpen(true);
                    }}
                    ref={deleteReviewButtonRef}
                    type="button"
                  >
                    삭제 검토
                  </button>
                </div>
              </>
            ) : isAuthAbsent ? (
              <>
                <h1 className="mt-4 text-[24px] font-extrabold leading-[1.35]">
                  계정 확인이 필요해요
                </h1>
                <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">
                  로그인은 되었지만 자동으로 연결할 수 있는 본인 정보가 없어요.
                </p>
                <div className="mt-5 rounded-[var(--radius-panel)] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4">
                  <h2 className="text-sm font-extrabold">지원 / Manual Only</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">
                    자동 복구와 자동 삭제는 제공하지 않아요. 운영 승인 또는 고객
                    지원 절차를 통해서만 처리해요.
                  </p>
                </div>
              </>
            ) : (
              <section
                aria-busy={viewState === "loading" || viewState === "pending"}
                aria-live="polite"
                className="mt-4"
              >
                <h1 className="text-[22px] font-extrabold leading-[1.4]">
                  {statusContent?.title}
                </h1>
                <p className="mt-3 text-sm leading-6 text-[var(--text-2)]">
                  {statusContent?.description}
                </p>

                {viewState === "pending" ? (
                  <button
                    className="mt-5 min-h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-4 text-sm font-bold text-[var(--text-3)]"
                    disabled
                    type="button"
                  >
                    처리 중
                  </button>
                ) : null}
                {viewState === "not-applicable" ? (
                  <Link
                    className="mt-5 flex min-h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand-primary-text)] px-4 text-sm font-extrabold text-[var(--text-inverse)]"
                    href={safeNextPath}
                  >
                    원래 화면으로 이동
                  </Link>
                ) : null}
                {viewState === "unauthorized" ? (
                  <Link
                    className="mt-5 flex min-h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand-primary-text)] px-4 text-sm font-extrabold text-[var(--text-inverse)]"
                    href={buildLoginPath(safeNextPath)}
                  >
                    다시 로그인
                  </Link>
                ) : null}
                {viewState === "conflict" ? (
                  <button
                    className="mt-5 min-h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] border border-[var(--brand-primary-border)] bg-[var(--surface)] px-4 text-sm font-extrabold text-[var(--brand-primary-text)]"
                    onClick={resetConflict}
                    type="button"
                  >
                    다시 검토
                  </button>
                ) : null}
                {viewState === "error" ? (
                  <button
                    className="mt-5 min-h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] border border-[var(--brand-primary-border)] bg-[var(--surface)] px-4 text-sm font-extrabold text-[var(--brand-primary-text)]"
                    onClick={retry}
                    type="button"
                  >
                    다시 시도
                  </button>
                ) : null}
              </section>
            )}
          </section>

          <aside className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--text-3)] lg:self-start">
            <h2 className="font-extrabold text-[var(--foreground)]">안전 안내</h2>
            <p className="mt-2">
              이 화면에서는 공개 목록이나 일반 마이페이지 정보를 보여주지 않아요.
            </p>
            <p className="mt-2">
              처리 중에는 버튼을 다시 눌러 중복 요청을 만들지 않아요.
            </p>
          </aside>
        </div>
      </div>

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
            <div className="mt-5 grid gap-4 text-sm leading-6">
              <section className="rounded-[var(--radius-panel)] border border-[var(--line)] p-4">
                <h3 className="font-extrabold">보존되는 것</h3>
                <p className="mt-1 text-[var(--text-2)]">
                  공개한 사용자 등록 완제품과 공개 레시피는 작성자 정보 없이
                  보존될 수 있어요.
                </p>
              </section>
              <section className="rounded-[var(--radius-panel)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4">
                <h3 className="font-extrabold text-[var(--danger-strong)]">
                  삭제되는 것
                </h3>
                <p className="mt-1 text-[var(--text-2)]">
                  개인 레시피, 식사 기록, 배치, 비공개 이미지가 삭제 대상이에요.
                </p>
              </section>
            </div>
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
