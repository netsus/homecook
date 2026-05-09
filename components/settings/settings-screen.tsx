"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ContentState } from "@/components/shared/content-state";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  deleteAccount,
  fetchUserProfile,
  isMypageApiError,
  logout,
  updateNickname,
  updateSettings,
  type UserProfileData,
} from "@/lib/api/mypage";
import {
  createPlannerColumn,
  deletePlannerColumn,
  fetchPlannerColumns,
  isPlannerApiError,
  updatePlannerColumn,
} from "@/lib/api/planner";
import type { PlannerColumnData } from "@/types/planner";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ViewState = "loading" | "error" | "ready";

export interface SettingsScreenProps {
  initialAuthenticated?: boolean;
}

export function SettingsScreen({
  initialAuthenticated = false,
}: SettingsScreenProps) {
  const router = useRouter();

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showNicknameSheet, setShowNicknameSheet] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [plannerColumns, setPlannerColumns] = useState<PlannerColumnData[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(true);
  const [columnsError, setColumnsError] = useState<string | null>(null);

  const [showColumnAddSheet, setShowColumnAddSheet] = useState(false);
  const [columnAddInput, setColumnAddInput] = useState("");
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [columnAddError, setColumnAddError] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<PlannerColumnData | null>(null);
  const [columnRenameInput, setColumnRenameInput] = useState("");
  const [isRenamingColumn, setIsRenamingColumn] = useState(false);
  const [columnRenameError, setColumnRenameError] = useState<string | null>(null);

  const [deleteColumnTarget, setDeleteColumnTarget] = useState<PlannerColumnData | null>(null);
  const [isDeletingColumn, setIsDeletingColumn] = useState(false);
  const [deleteColumnError, setDeleteColumnError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setViewState("loading");
    setErrorMessage(null);
    try {
      const result = await fetchUserProfile();
      setProfile(result);
      setViewState("ready");
    } catch (error) {
      if (isMypageApiError(error) && error.status === 401) {
        setProfile(null);
        setAuthState("unauthorized");
      } else if (isMypageApiError(error)) {
        setErrorMessage(error.message.replace(/\.$/, ""));
        setViewState("error");
      } else {
        setErrorMessage("데이터를 불러오지 못했어요");
        setViewState("error");
      }
    }
  }, []);

  useEffect(() => {
    const e2eAuthOverride = readE2EAuthOverride();

    if (typeof e2eAuthOverride === "boolean") {
      setAuthState(e2eAuthOverride ? "authenticated" : "unauthorized");
      return;
    }

    if (initialAuthenticated) {
      setAuthState("authenticated");

      if (!hasSupabasePublicEnv()) {
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: Session | null) => {
          setAuthState(session ? "authenticated" : "unauthorized");
        },
      );

      return () => {
        subscription.unsubscribe();
      };
    }

    if (!hasSupabasePublicEnv()) {
      setAuthState("unauthorized");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        setAuthState(result.data.session ? "authenticated" : "unauthorized");
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setAuthState(session ? "authenticated" : "unauthorized");
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [initialAuthenticated]);

  const loadColumns = useCallback(async () => {
    setColumnsLoading(true);
    setColumnsError(null);
    try {
      const result = await fetchPlannerColumns();
      setPlannerColumns(
        [...result.columns].sort((a, b) => a.sort_order - b.sort_order),
      );
    } catch (error) {
      if (isPlannerApiError(error) && error.status === 401) {
        return;
      }
      setColumnsError(
        isPlannerApiError(error) ? error.message : "끼니 컬럼을 불러오지 못했어요",
      );
    } finally {
      setColumnsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authState !== "authenticated") return;
    void loadProfile();
    void loadColumns();
  }, [authState, loadProfile, loadColumns]);

  const handleToggleWakeLock = useCallback(async () => {
    if (!profile) return;

    const prev = profile.settings.screen_wake_lock;
    setErrorMessage(null);
    setProfile({
      ...profile,
      settings: { ...profile.settings, screen_wake_lock: !prev },
    });

    try {
      const result = await updateSettings({ screen_wake_lock: !prev });
      setProfile((p) => (p ? { ...p, settings: result.settings } : p));
    } catch (error) {
      setProfile((p) =>
        p ? { ...p, settings: { ...p.settings, screen_wake_lock: prev } } : p,
      );
      if (isMypageApiError(error)) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("설정 변경에 실패했어요");
      }
    }
  }, [profile]);

  const handleSaveNickname = useCallback(async () => {
    const trimmed = nicknameInput.trim();
    if (trimmed.length < 2 || trimmed.length > 30) return;

    setNicknameError(null);
    setIsSavingNickname(true);
    try {
      const result = await updateNickname(trimmed);
      setProfile(result);
      setShowNicknameSheet(false);
    } catch (error) {
      if (isMypageApiError(error)) {
        setNicknameError(error.message);
      } else {
        setNicknameError("닉네임 변경에 실패했어요");
      }
    } finally {
      setIsSavingNickname(false);
    }
  }, [nicknameInput]);

  const handleLogout = useCallback(async () => {
    setLogoutError(null);
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace("/");
    } catch (error) {
      if (isMypageApiError(error)) {
        setLogoutError(error.message);
      } else {
        setLogoutError("로그아웃에 실패했어요");
      }
      setIsLoggingOut(false);
    }
  }, [router]);

  const handleDeleteAccount = useCallback(async () => {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteAccount();
    } catch (error) {
      if (isMypageApiError(error)) {
        setDeleteError(error.message);
      } else {
        setDeleteError("탈퇴에 실패했어요");
      }
      setIsDeleting(false);
      return;
    }
    try {
      await logout();
    } catch {
      setDeleteError("탈퇴는 완료되었으나 로그아웃에 실패했어요. 브라우저를 닫아주세요.");
      setIsDeleting(false);
      return;
    }
    router.replace("/");
  }, [router]);

  const openNicknameSheet = useCallback(() => {
    setNicknameInput(profile?.nickname ?? "");
    setNicknameError(null);
    setShowNicknameSheet(true);
  }, [profile]);

  const handleAddColumn = useCallback(async () => {
    const trimmed = columnAddInput.trim();
    if (trimmed.length < 1 || trimmed.length > 30) return;

    setColumnAddError(null);
    setIsAddingColumn(true);
    try {
      const result = await createPlannerColumn(trimmed);
      setPlannerColumns((prev) =>
        [...prev, result.column].sort((a, b) => a.sort_order - b.sort_order),
      );
      setShowColumnAddSheet(false);
      setColumnAddInput("");
    } catch (error) {
      if (isPlannerApiError(error)) {
        setColumnAddError(error.message);
      } else {
        setColumnAddError("끼니 컬럼을 추가하지 못했어요");
      }
    } finally {
      setIsAddingColumn(false);
    }
  }, [columnAddInput]);

  const handleRenameColumn = useCallback(async () => {
    if (!renameTarget) return;
    const trimmed = columnRenameInput.trim();
    if (trimmed.length < 1 || trimmed.length > 30) return;

    setColumnRenameError(null);
    setIsRenamingColumn(true);
    try {
      const result = await updatePlannerColumn(renameTarget.id, trimmed);
      setPlannerColumns((prev) =>
        prev.map((col) => (col.id === result.column.id ? result.column : col)),
      );
      setRenameTarget(null);
    } catch (error) {
      if (isPlannerApiError(error)) {
        setColumnRenameError(error.message);
      } else {
        setColumnRenameError("끼니 이름을 변경하지 못했어요");
      }
    } finally {
      setIsRenamingColumn(false);
    }
  }, [renameTarget, columnRenameInput]);

  const handleDeleteColumn = useCallback(async () => {
    if (!deleteColumnTarget) return;

    setDeleteColumnError(null);
    setIsDeletingColumn(true);
    try {
      await deletePlannerColumn(deleteColumnTarget.id);
      setPlannerColumns((prev) =>
        prev
          .filter((col) => col.id !== deleteColumnTarget.id)
          .map((col, index) => ({ ...col, sort_order: index })),
      );
      setDeleteColumnTarget(null);
    } catch (error) {
      if (isPlannerApiError(error)) {
        setDeleteColumnError(error.message);
      } else {
        setDeleteColumnError("끼니 컬럼을 삭제하지 못했어요");
      }
    } finally {
      setIsDeletingColumn(false);
    }
  }, [deleteColumnTarget]);

  const openColumnRenameSheet = useCallback((column: PlannerColumnData) => {
    setColumnRenameInput(column.name);
    setColumnRenameError(null);
    setRenameTarget(column);
  }, []);

  const columnAddValid =
    columnAddInput.trim().length >= 1 && columnAddInput.trim().length <= 30;
  const columnAddSaveDisabled = !columnAddValid || isAddingColumn;

  const columnRenameValid =
    columnRenameInput.trim().length >= 1 && columnRenameInput.trim().length <= 30;
  const columnRenameSaveDisabled = !columnRenameValid || isRenamingColumn;

  const nicknameValid =
    nicknameInput.trim().length >= 2 && nicknameInput.trim().length <= 30;
  const nicknameSaveDisabled = !nicknameValid || isSavingNickname;

  if (authState === "checking") {
    return (
      <div>
        <SettingsAppBar />
        <div data-testid="settings-loading">
          <SettingsLoadingSkeleton />
        </div>
      </div>
    );
  }

  if (authState === "unauthorized") {
    return (
      <div>
        <SettingsAppBar />
        <div className="px-4 py-8">
          <ContentState
            description="설정 화면을 이용하려면 로그인이 필요해요."
            eyebrow="설정 접근"
            safeBottomPadding
            title="로그인이 필요해요"
            tone="gate"
          >
            <div className="space-y-3">
              <SocialLoginButtons nextPath="/settings" />
              <Link
                className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--foreground)]"
                href="/login?next=/settings"
              >
                로그인 화면으로 이동
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-[var(--muted)]"
                href="/"
              >
                홈으로 돌아가기
              </Link>
            </div>
          </ContentState>
        </div>
      </div>
    );
  }

  if (viewState === "loading") {
    return (
      <div>
        <SettingsAppBar />
        <div data-testid="settings-loading">
          <SettingsLoadingSkeleton />
        </div>
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div>
        <SettingsAppBar />
        <div className="flex flex-col items-center justify-center px-4 py-16">
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            {errorMessage ?? "데이터를 불러오지 못했어요"}
          </h2>
          <button
            className="mt-4 flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white"
            onClick={() => void loadProfile()}
            type="button"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SettingsAppBar />

      {errorMessage ? (
        <div
          className="mx-4 mt-2 rounded-[var(--radius-md)] bg-[var(--danger)] px-4 py-3 text-center text-sm font-semibold text-white"
          data-testid="settings-error-toast"
          role="status"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="px-4 pt-4">
        <p className="mb-2 text-sm font-semibold text-[var(--text-3)]">
          앱 설정
        </p>

        <div className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]">
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-3">
              <p className="text-base font-medium text-[var(--foreground)]">
                요리모드 화면 꺼짐 방지
              </p>
              <p className="mt-1 text-sm text-[var(--text-3)]">
                요리 중 화면이 꺼지지 않아요
              </p>
            </div>
            <button
              aria-checked={profile?.settings.screen_wake_lock ?? false}
              aria-label="요리모드 화면 꺼짐 방지"
              className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
              onClick={() => void handleToggleWakeLock()}
              role="switch"
              type="button"
            >
              <span
                aria-hidden="true"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                  profile?.settings.screen_wake_lock
                    ? "bg-[var(--brand)]"
                    : "bg-[var(--surface-subtle)]"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                    profile?.settings.screen_wake_lock
                      ? "translate-x-[22px]"
                      : "translate-x-[2px]"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-6" data-testid="column-management-section">
        <p className="mb-2 text-sm font-semibold text-[var(--text-3)]">
          끼니 컬럼 관리
        </p>

        {columnsLoading ? (
          <div className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]" data-testid="columns-loading">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-3 h-5 w-32" />
            <Skeleton className="mt-3 h-5 w-28" />
          </div>
        ) : columnsError ? (
          <div className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]" data-testid="columns-error">
            <p className="text-sm text-[var(--danger)]">{columnsError}</p>
            <button
              className="mt-2 text-sm font-semibold text-[var(--brand)]"
              onClick={() => void loadColumns()}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
            <div className="divide-y divide-[var(--surface-subtle)]" data-testid="column-list">
              {plannerColumns.map((column) => (
                <div
                  key={column.id}
                  className="flex min-h-[52px] items-center px-4 py-2.5"
                  data-testid={`column-item-${column.id}`}
                >
                  <span className="min-w-0 flex-1 truncate text-base font-medium text-[var(--foreground)]">
                    {column.name}
                  </span>
                  <button
                    aria-label={`${column.name} 이름 변경`}
                    className="ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-3)]"
                    data-testid={`rename-column-${column.id}`}
                    onClick={() => openColumnRenameSheet(column)}
                    type="button"
                  >
                    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    aria-label={`${column.name} 삭제`}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center ${
                      plannerColumns.length <= 1
                        ? "text-[var(--text-4)] cursor-not-allowed"
                        : "text-[var(--text-3)]"
                    }`}
                    data-testid={`delete-column-${column.id}`}
                    disabled={plannerColumns.length <= 1}
                    onClick={() => setDeleteColumnTarget(column)}
                    type="button"
                  >
                    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--surface-subtle)] px-4 py-3">
              <button
                className={`flex w-full min-h-[44px] items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold ${
                  plannerColumns.length >= 5
                    ? "bg-[var(--surface-subtle)] text-[var(--text-4)] cursor-not-allowed"
                    : "bg-[var(--surface-fill)] text-[var(--brand)]"
                }`}
                data-testid="add-column-button"
                disabled={plannerColumns.length >= 5}
                onClick={() => {
                  setColumnAddInput("");
                  setColumnAddError(null);
                  setShowColumnAddSheet(true);
                }}
                type="button"
              >
                {plannerColumns.length >= 5
                  ? "끼니 컬럼은 최대 5개까지 만들 수 있어요"
                  : "+ 끼니 컬럼 추가"}
              </button>
            </div>
          </div>
        )}

        <p className="mt-2 px-1 text-xs text-[var(--text-4)]">
          최소 1개 ~ 최대 5개 · 현재 {plannerColumns.length}개
        </p>
      </div>

      <div className="px-4 pt-6">
        <p className="mb-2 text-sm font-semibold text-[var(--text-3)]">
          계정 관리
        </p>

        <button
          aria-label={`닉네임 변경, 현재 닉네임: ${profile?.nickname ?? ""}`}
          className="flex w-full items-center rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]"
          data-testid="nickname-row"
          onClick={openNicknameSheet}
          type="button"
        >
          <div className="flex-1 text-left">
            <p className="text-sm text-[var(--text-3)]">닉네임</p>
            <p className="mt-1 text-base font-medium text-[var(--foreground)]">
              {profile?.nickname ?? ""}
            </p>
          </div>
          <svg
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-[var(--text-3)]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          className="mt-8 flex w-full min-h-[52px] items-center justify-center rounded-[var(--radius-lg)] bg-[var(--surface)] text-base font-medium text-[var(--text-2)]"
          onClick={() => setShowLogoutDialog(true)}
          type="button"
        >
          로그아웃
        </button>

        <div className="mt-4 flex justify-center">
          <button
            className="min-h-[44px] text-sm text-[var(--text-3)] underline"
            onClick={() => setShowDeleteDialog(true)}
            type="button"
          >
            회원탈퇴
          </button>
        </div>
      </div>

      {showNicknameSheet ? (
        <NicknameEditSheet
          errorMessage={nicknameError}
          isSaving={isSavingNickname}
          nicknameInput={nicknameInput}
          onClose={() => setShowNicknameSheet(false)}
          onInputChange={(v) => {
            setNicknameInput(v);
            setNicknameError(null);
          }}
          onSave={() => void handleSaveNickname()}
          saveDisabled={nicknameSaveDisabled}
        />
      ) : null}

      {showLogoutDialog ? (
        <ConfirmDialog
          confirmLabel={isLoggingOut ? "로그아웃 중..." : "로그아웃하기"}
          confirmTone="brand"
          disabled={isLoggingOut}
          errorMessage={logoutError}
          onCancel={() => {
            setShowLogoutDialog(false);
            setLogoutError(null);
          }}
          onConfirm={() => void handleLogout()}
          title="로그아웃할까요?"
        />
      ) : null}

      {showDeleteDialog ? (
        <ConfirmDialog
          confirmLabel={isDeleting ? "탈퇴 중..." : "탈퇴하기"}
          confirmTone="danger"
          description="탈퇴하면 모든 데이터가 삭제되며 되돌릴 수 없어요."
          disabled={isDeleting}
          errorMessage={deleteError}
          onCancel={() => {
            setShowDeleteDialog(false);
            setDeleteError(null);
          }}
          onConfirm={() => void handleDeleteAccount()}
          title="정말 탈퇴하시겠어요?"
        />
      ) : null}

      {showColumnAddSheet ? (
        <ColumnNameSheet
          errorMessage={columnAddError}
          inputValue={columnAddInput}
          isSaving={isAddingColumn}
          onClose={() => setShowColumnAddSheet(false)}
          onInputChange={(v) => {
            setColumnAddInput(v);
            setColumnAddError(null);
          }}
          onSave={() => void handleAddColumn()}
          saveDisabled={columnAddSaveDisabled}
          testIdPrefix="add-column"
          title="끼니 컬럼 추가"
        />
      ) : null}

      {renameTarget ? (
        <ColumnNameSheet
          errorMessage={columnRenameError}
          inputValue={columnRenameInput}
          isSaving={isRenamingColumn}
          onClose={() => {
            setRenameTarget(null);
            setColumnRenameError(null);
          }}
          onInputChange={(v) => {
            setColumnRenameInput(v);
            setColumnRenameError(null);
          }}
          onSave={() => void handleRenameColumn()}
          saveDisabled={columnRenameSaveDisabled}
          testIdPrefix="rename-column"
          title="끼니 이름 변경"
        />
      ) : null}

      {deleteColumnTarget ? (
        <ConfirmDialog
          confirmLabel={isDeletingColumn ? "삭제 중..." : "삭제하기"}
          confirmTone="danger"
          description={`"${deleteColumnTarget.name}" 컬럼을 삭제할까요?`}
          disabled={isDeletingColumn}
          errorMessage={deleteColumnError}
          onCancel={() => {
            setDeleteColumnTarget(null);
            setDeleteColumnError(null);
          }}
          onConfirm={() => void handleDeleteColumn()}
          title="끼니 컬럼 삭제"
        />
      ) : null}
    </div>
  );
}

function SettingsAppBar() {
  const router = useRouter();

  return (
    <div className="flex h-14 items-center border-b border-[var(--line)] bg-[var(--background)] px-2">
      <button
        aria-label="뒤로가기"
        className="flex h-11 w-11 shrink-0 items-center justify-center"
        onClick={() => router.push("/mypage")}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="h-6 w-6 text-[var(--foreground)]"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h1 className="flex-1 text-center text-xl font-extrabold text-[var(--foreground)]">
        설정
      </h1>
      <div className="h-11 w-11 shrink-0" />
    </div>
  );
}

function SettingsLoadingSkeleton() {
  return (
    <div className="px-4 pt-4">
      <Skeleton className="mb-2 h-4 w-12" />
      <div className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-52" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
      </div>
      <Skeleton className="mb-2 mt-6 h-4 w-16" />
      <div className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="mt-2 h-5 w-20" />
      </div>
    </div>
  );
}

interface NicknameEditSheetProps {
  nicknameInput: string;
  onInputChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  saveDisabled: boolean;
  isSaving: boolean;
  errorMessage: string | null;
}

function NicknameEditSheet({
  nicknameInput,
  onInputChange,
  onSave,
  onClose,
  saveDisabled,
  isSaving,
  errorMessage,
}: NicknameEditSheetProps) {
  const inputHelpId = "settings-nickname-help";
  const inputErrorId = "settings-nickname-error";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      data-testid="nickname-sheet-backdrop"
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-t-[var(--radius-xl)] bg-[var(--panel)] p-6 shadow-[var(--shadow-3)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[var(--line)]" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            닉네임 변경
          </h2>
          <button
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center text-[var(--text-3)]"
            onClick={onClose}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <input
          aria-describedby={errorMessage ? `${inputHelpId} ${inputErrorId}` : inputHelpId}
          autoFocus
          className={`w-full rounded-[var(--radius-sm)] border-b-2 bg-[var(--surface-fill)] px-4 py-3 text-base text-[var(--foreground)] outline-none ${
            errorMessage
              ? "border-[var(--danger)]"
              : "border-transparent focus:border-[var(--brand)]"
          }`}
          maxLength={30}
          onChange={(e) => onInputChange(e.target.value)}
          type="text"
          value={nicknameInput}
        />

        <p className="mt-2 text-xs text-[var(--text-3)]" id={inputHelpId}>
          2~30자로 입력해 주세요
        </p>

        {errorMessage ? (
          <p
            className="mt-2 text-xs text-[var(--danger)]"
            id={inputErrorId}
            data-testid="nickname-error"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          className={`mt-4 flex w-full min-h-[52px] items-center justify-center rounded-[var(--radius-md)] text-base font-semibold ${
            saveDisabled
              ? "bg-[var(--surface-subtle)] text-[var(--text-4)]"
              : "bg-[var(--brand)] text-white"
          }`}
          disabled={saveDisabled}
          onClick={onSave}
          type="button"
        >
          {isSaving ? "변경 중..." : "변경하기"}
        </button>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  description?: string;
  confirmLabel: string;
  confirmTone: "brand" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
  errorMessage?: string | null;
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmTone,
  onCancel,
  onConfirm,
  disabled = false,
  errorMessage,
}: ConfirmDialogProps) {
  const confirmBg =
    confirmTone === "danger" ? "bg-[var(--danger)]" : "bg-[var(--brand)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        aria-modal="true"
        className="w-full max-w-sm rounded-[var(--radius-xl)] bg-[var(--surface)] p-6 shadow-[var(--shadow-3)]"
        role="alertdialog"
      >
        <h3 className="text-lg font-bold text-[var(--foreground)]">{title}</h3>
        {description ? (
          <p className="mt-2 text-sm text-[var(--text-3)]">{description}</p>
        ) : null}
        {errorMessage ? (
          <p
            className="mt-2 text-xs text-[var(--danger)]"
            data-testid="dialog-error"
          >
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-5 flex gap-3">
          <button
            className="flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold text-[var(--text-2)]"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className={`flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] ${confirmBg} text-sm font-semibold text-white disabled:opacity-60`}
            disabled={disabled}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ColumnNameSheetProps {
  title: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  saveDisabled: boolean;
  isSaving: boolean;
  errorMessage: string | null;
  testIdPrefix: string;
}

function ColumnNameSheet({
  title,
  inputValue,
  onInputChange,
  onSave,
  onClose,
  saveDisabled,
  isSaving,
  errorMessage,
  testIdPrefix,
}: ColumnNameSheetProps) {
  const titleId = `${testIdPrefix}-title`;
  const inputHelpId = `${testIdPrefix}-help`;
  const inputErrorId = `${testIdPrefix}-error`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      data-testid={`${testIdPrefix}-sheet-backdrop`}
      onClick={onClose}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-t-[var(--radius-xl)] bg-[var(--panel)] p-6 shadow-[var(--shadow-3)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[var(--line)]" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--foreground)]" id={titleId}>
            {title}
          </h2>
          <button
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center text-[var(--text-3)]"
            onClick={onClose}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <input
          aria-describedby={errorMessage ? `${inputHelpId} ${inputErrorId}` : inputHelpId}
          aria-label={title}
          autoFocus
          className={`w-full rounded-[var(--radius-sm)] border-b-2 bg-[var(--surface-fill)] px-4 py-3 text-base text-[var(--foreground)] outline-none ${
            errorMessage
              ? "border-[var(--danger)]"
              : "border-transparent focus:border-[var(--brand)]"
          }`}
          data-testid={`${testIdPrefix}-input`}
          maxLength={30}
          onChange={(e) => onInputChange(e.target.value)}
          type="text"
          value={inputValue}
        />

        <p className="mt-2 text-xs text-[var(--text-3)]" id={inputHelpId}>
          1~30자로 입력해 주세요
        </p>

        {errorMessage ? (
          <p
            className="mt-2 text-xs text-[var(--danger)]"
            data-testid={`${testIdPrefix}-sheet-error`}
            id={inputErrorId}
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          className={`mt-4 flex w-full min-h-[52px] items-center justify-center rounded-[var(--radius-md)] text-base font-semibold ${
            saveDisabled
              ? "bg-[var(--surface-subtle)] text-[var(--text-4)]"
              : "bg-[var(--brand)] text-white"
          }`}
          data-testid={`${testIdPrefix}-save`}
          disabled={saveDisabled}
          onClick={onSave}
          type="button"
        >
          {isSaving ? "저장 중..." : "저장하기"}
        </button>
      </div>
    </div>
  );
}
