"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ContentState } from "@/components/shared/content-state";
import { AppFeedbackToast } from "@/components/shared/app-feedback-toast";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { LinkedAuthProviders } from "@/components/auth/linked-auth-providers";
import {
  SettingsMobileScreen,
  type SettingsMobileSurface,
} from "@/components/settings/settings-mobile-screen";
import {
  SETTINGS_MOBILE_MAIN_CLASS,
  SETTINGS_MOBILE_SECTION_CLASS,
  SettingsMobileAccountLoadingCard,
  SettingsMobileColumnLoadingContent,
  SettingsMobileDangerLoadingContent,
  SettingsMobileToggleLoadingRow,
} from "@/components/settings/settings-mobile-loading";
import {
  AppBackButton,
  AppBackButtonSpacer,
} from "@/components/shared/app-back-button";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebCard,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebIconButton,
  WebModal,
  WebShell,
  WebSkeleton,
  WebTopNav,
} from "@/components/web";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { clearLastAuthProvider } from "@/lib/auth/provider-memory";
import {
  deleteAccount,
  fetchUserProfile,
  isMypageApiError,
  logout,
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
type FeedbackTone = "success" | "danger";

const MYPAGE_PREFERENCES_HREF = "/mypage?tab=preferences";
const SETTINGS_FEEDBACK_DURATION_MS = 3000;

export interface SettingsScreenProps {
  initialAuthenticated?: boolean;
}

export function SettingsScreen({
  initialAuthenticated = false,
}: SettingsScreenProps) {
  const router = useRouter();
  const isMobileViewport = useIsMobileViewport();
  const appReturn = useAppReturn({ fallback: MYPAGE_PREFERENCES_HREF });
  const mobileSurface: SettingsMobileSurface = "settings";

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    message: string;
    tone: FeedbackTone;
  } | null>(null);

  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [plannerColumns, setPlannerColumns] = useState<PlannerColumnData[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(true);
  const [columnsError, setColumnsError] = useState<string | null>(null);

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
  const [columnsEditMode, setColumnsEditMode] = useState(false);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setViewState("loading");
    setErrorMessage(null);
    setFeedbackMessage(null);
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
    if (!feedbackMessage) return;

    const timer = window.setTimeout(() => {
      setFeedbackMessage(null);
    }, SETTINGS_FEEDBACK_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [feedbackMessage]);

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
        isPlannerApiError(error) ? error.message : "끼니를 불러오지 못했어요",
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
    setFeedbackMessage(null);
    setProfile({
      ...profile,
      settings: { ...profile.settings, screen_wake_lock: !prev },
    });

    try {
      const result = await updateSettings({ screen_wake_lock: !prev });
      setProfile((p) => (p ? { ...p, settings: result.settings } : p));
      setFeedbackMessage({ message: "설정을 저장했어요.", tone: "success" });
    } catch (error) {
      setProfile((p) =>
        p ? { ...p, settings: { ...p.settings, screen_wake_lock: prev } } : p,
      );
      if (isMypageApiError(error)) {
        setFeedbackMessage({ message: error.message, tone: "danger" });
      } else {
        setFeedbackMessage({ message: "설정 변경에 실패했어요.", tone: "danger" });
      }
    }
  }, [profile]);

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
      clearLastAuthProvider();
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

  const handleAddColumn = useCallback(async () => {
    const trimmed = columnAddInput.trim();
    if (trimmed.length < 1 || trimmed.length > 30) return;

    setColumnAddError(null);
    setFeedbackMessage(null);
    setIsAddingColumn(true);
    try {
      const result = await createPlannerColumn(trimmed);
      setPlannerColumns((prev) =>
        [...prev, result.column].sort((a, b) => a.sort_order - b.sort_order),
      );
      setColumnAddInput("");
      setFeedbackMessage({ message: "끼니를 추가했어요.", tone: "success" });
    } catch (error) {
      if (isPlannerApiError(error)) {
        setColumnAddError(error.message);
      } else {
        setColumnAddError("끼니를 추가하지 못했어요");
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
    setFeedbackMessage(null);
    setIsRenamingColumn(true);
    try {
      const result = await updatePlannerColumn(renameTarget.id, trimmed);
      setPlannerColumns((prev) =>
        prev.map((col) => (col.id === result.column.id ? result.column : col)),
      );
      setRenameTarget(null);
      setFeedbackMessage({ message: "끼니 이름을 변경했어요.", tone: "success" });
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
    setFeedbackMessage(null);
    setIsDeletingColumn(true);
    try {
      await deletePlannerColumn(deleteColumnTarget.id);
      setPlannerColumns((prev) =>
        prev
          .filter((col) => col.id !== deleteColumnTarget.id)
          .map((col, index) => ({ ...col, sort_order: index })),
      );
      setDeleteColumnTarget(null);
      setColumnsEditMode(false);
      setFeedbackMessage({ message: "끼니를 삭제했어요.", tone: "danger" });
    } catch (error) {
      if (isPlannerApiError(error)) {
        setDeleteColumnError(error.message);
      } else {
        setDeleteColumnError("끼니를 삭제하지 못했어요");
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

  const handleMoveColumn = useCallback(async (columnId: string, targetIndex: number) => {
    const reorderResult = reorderPlannerColumns(plannerColumns, columnId, targetIndex);

    if (!reorderResult) return;

    const { nextColumns, nextIndex, previousColumns } = reorderResult;

    setPlannerColumns(nextColumns);
    setFeedbackMessage(null);

    try {
      await updatePlannerColumn(columnId, { sort_order: nextIndex });
      setFeedbackMessage({ message: "끼니 순서를 저장했어요.", tone: "success" });
    } catch (error) {
      setPlannerColumns(previousColumns);
      if (isPlannerApiError(error)) {
        setFeedbackMessage({ message: error.message, tone: "danger" });
      } else {
        setFeedbackMessage({ message: "끼니 순서를 저장하지 못했어요.", tone: "danger" });
      }
    }
  }, [plannerColumns]);

  const handleDropColumn = useCallback((targetColumnId: string) => {
    if (!draggingColumnId || draggingColumnId === targetColumnId) {
      setDraggingColumnId(null);
      return;
    }

    const targetIndex = plannerColumns.findIndex((column) => column.id === targetColumnId);
    setDraggingColumnId(null);

    if (targetIndex >= 0) {
      void handleMoveColumn(draggingColumnId, targetIndex);
    }
  }, [draggingColumnId, handleMoveColumn, plannerColumns]);

  const columnAddValid =
    columnAddInput.trim().length >= 1 && columnAddInput.trim().length <= 30;
  const columnAddSaveDisabled = !columnAddValid || isAddingColumn;

  const columnRenameValid =
    columnRenameInput.trim().length >= 1 && columnRenameInput.trim().length <= 30;
  const columnRenameSaveDisabled = !columnRenameValid || isRenamingColumn;
  const readyToast = feedbackMessage;

  if (authState === "checking") {
    if (isMobileViewport) {
      return <SettingsMobileLoadingShell />;
    }

    return <SettingsDesktopLoadingShell />;
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
                className="inline-flex min-h-[var(--control-height-md)] w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--foreground)]"
                href="/login?next=/settings"
              >
                로그인 화면으로 이동
              </Link>
              <Link
                className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-[var(--muted)]"
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
    if (isMobileViewport) {
      return <SettingsMobileLoadingShell />;
    }

    return <SettingsDesktopLoadingShell />;
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
            className="mt-4 flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-[var(--text-inverse)]"
            onClick={() => void loadProfile()}
            type="button"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (isMobileViewport) {
    return (
      <SettingsMobileScreen
        columnAddError={columnAddError}
        columnAddInput={columnAddInput}
        columnAddSaveDisabled={columnAddSaveDisabled}
        columnRenameError={columnRenameError}
        columnRenameInput={columnRenameInput}
        columnRenameSaveDisabled={columnRenameSaveDisabled}
        columnsEditMode={columnsEditMode}
        columnsError={columnsError}
        columnsLoading={columnsLoading}
        deleteColumnError={deleteColumnError}
        deleteColumnTarget={deleteColumnTarget}
        deleteError={deleteError}
        errorMessage={errorMessage}
        feedbackMessage={feedbackMessage}
        isAddingColumn={isAddingColumn}
        isDeleting={isDeleting}
        isDeletingColumn={isDeletingColumn}
        isLoggingOut={isLoggingOut}
        isRenamingColumn={isRenamingColumn}
        logoutError={logoutError}
        plannerColumns={plannerColumns}
        profile={profile}
        renameTarget={renameTarget}
        showDeleteDialog={showDeleteDialog}
        showLogoutDialog={showLogoutDialog}
        surface={mobileSurface}
        onAddColumn={() => void handleAddColumn()}
        onCloseDeleteColumnDialog={() => {
          setDeleteColumnTarget(null);
          setDeleteColumnError(null);
        }}
        onCloseDeleteDialog={() => {
          setShowDeleteDialog(false);
          setDeleteError(null);
        }}
        onCloseLogoutDialog={() => {
          setShowLogoutDialog(false);
          setLogoutError(null);
        }}
        onCloseRenameColumnSheet={() => {
          setRenameTarget(null);
          setColumnRenameError(null);
        }}
        onColumnsEditModeChange={setColumnsEditMode}
        onColumnAddInputChange={(value) => {
          setColumnAddInput(value);
          setColumnAddError(null);
        }}
        onColumnRenameInputChange={(value) => {
          setColumnRenameInput(value);
          setColumnRenameError(null);
        }}
        onConfirmDelete={() => void handleDeleteAccount()}
        onConfirmDeleteColumn={() => void handleDeleteColumn()}
        onConfirmLogout={() => void handleLogout()}
        onDeleteColumnTarget={(column) => {
          setDeleteColumnError(null);
          setDeleteColumnTarget(column);
        }}
        onMoveColumn={(columnId, targetIndex) => void handleMoveColumn(columnId, targetIndex)}
        onOpenDeleteDialog={() => {
          setDeleteError(null);
          setShowDeleteDialog(true);
        }}
        onOpenLogoutDialog={() => {
          setLogoutError(null);
          setShowLogoutDialog(true);
        }}
        onRenameColumn={() => void handleRenameColumn()}
        onRenameColumnTarget={openColumnRenameSheet}
        onRetryColumns={() => void loadColumns()}
        onToggleWakeLock={() => void handleToggleWakeLock()}
      />
    );
  }

  return (
    <WebShell className="web-settings-shell" wide>
      <WebTopNav
        activeId="mypage"
        rightSlot={<SettingsProfilePill nickname={profile?.nickname} />}
      />
      <main className="web-settings-screen">
        <nav aria-label="설정 경로" className="web-breadcrumb">
          <Link className="web-breadcrumb-link" href={appReturn.href}>
            ‹ 마이페이지
          </Link>
          <span className="web-breadcrumb-sep">/</span>
          <span className="web-breadcrumb-current">환경설정</span>
        </nav>

        <div className="web-settings-header">
          <h1>환경설정</h1>
          <p>끼니 관리, 요리모드 화면 켜둠, 계정 상태를 관리해요.</p>
        </div>

        {readyToast ? (
          <AppFeedbackToast
            message={readyToast.message}
            testId="settings-error-toast"
            tone={readyToast.tone === "success" ? "success" : "error"}
          />
        ) : null}

        <section
          className="web-settings-section web-settings-bordered-section"
          data-testid="column-management-section"
        >
          <div className="web-settings-section-title">
            <h2>끼니 관리</h2>
            <div className="web-settings-column-description-row">
              <p>
                끼니는 최대 5개까지 사용할 수 있어요. 드래그해서 바꾼 순서는 플래너에 그대로 표시돼요.
              </p>
              {!columnsLoading && !columnsError ? (
                <WebButton
                  className="web-settings-delete-button"
                  onClick={() => setColumnsEditMode((current) => !current)}
                  variant="tertiary"
                >
                  {columnsEditMode ? "완료" : "끼니 삭제"}
                </WebButton>
              ) : null}
            </div>
          </div>
          {columnsLoading ? (
            <WebCard className="web-settings-list" data-testid="columns-loading">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="mt-3 h-5 w-32" />
              <Skeleton className="mt-3 h-5 w-28" />
            </WebCard>
          ) : columnsError ? (
            <WebCard className="web-settings-list" data-testid="columns-error">
              <p className="text-sm text-[var(--danger)]">{columnsError}</p>
              <WebButton onClick={() => void loadColumns()} size="sm" variant="secondary">
                다시 시도
              </WebButton>
            </WebCard>
          ) : (
            <>
              <WebCard className="web-settings-column-card">
                <div className="web-settings-column-list" data-testid="column-list">
                  {plannerColumns.map((column, index) => (
                    <div
                      className={[
                        "web-settings-column-row",
                        draggingColumnId === column.id
                          ? "web-settings-column-row-dragging"
                          : "",
                      ].join(" ")}
                      data-testid={`column-item-${column.id}`}
                      draggable
                      key={column.id}
                      onDragEnd={() => setDraggingColumnId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", column.id);
                        setDraggingColumnId(column.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleDropColumn(column.id);
                      }}
                    >
                      <button
                        aria-label={`${column.name} 순서 드래그`}
                        className="web-settings-drag-handle"
                        data-testid={`column-drag-${column.id}`}
                        type="button"
                      >
                        <DragHandleIcon />
                      </button>
                      <div className="web-settings-column-field" data-testid={`column-name-${column.id}`}>
                        <strong className="web-settings-column-name" title={column.name}>
                          {column.name}
                        </strong>
                      </div>
                      <span className="web-settings-column-buttons">
                        <span className="web-settings-reorder-buttons">
                          <button
                            aria-label={`${column.name} 위로 이동`}
                            className="web-settings-reorder-button"
                            disabled={index === 0}
                            onClick={() => void handleMoveColumn(column.id, index - 1)}
                            type="button"
                          >
                            <ReorderArrowIcon direction="up" />
                          </button>
                          <button
                            aria-label={`${column.name} 아래로 이동`}
                            className="web-settings-reorder-button"
                            disabled={index === plannerColumns.length - 1}
                            onClick={() => void handleMoveColumn(column.id, index + 1)}
                            type="button"
                          >
                            <ReorderArrowIcon direction="down" />
                          </button>
                        </span>
                        <button
                          aria-label={`${column.name} 이름 변경`}
                          className="web-settings-icon-button"
                          data-testid={`rename-column-${column.id}`}
                          onClick={() => openColumnRenameSheet(column)}
                          type="button"
                        >
                          <PencilIcon />
                        </button>
                        {columnsEditMode ? (
                          <button
                            aria-label={`${column.name} 끼니 삭제`}
                            className="web-settings-icon-button web-settings-icon-danger"
                            data-testid={`delete-column-${column.id}`}
                            disabled={plannerColumns.length <= 1}
                            onClick={() => setDeleteColumnTarget(column)}
                            type="button"
                          >
                            <TrashIcon />
                          </button>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
                {plannerColumns.length < 5 ? (
                  <form
                    className="web-settings-column-add"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleAddColumn();
                    }}
                  >
                    <input
                      aria-label="새 끼니 이름"
                      className="web-mypage-column-input web-mypage-column-input-prominent"
                      data-testid="add-column-input"
                      maxLength={30}
                      onChange={(event) => {
                        setColumnAddInput(event.target.value);
                        setColumnAddError(null);
                      }}
                      placeholder="새 끼니 이름"
                      type="text"
                      value={columnAddInput}
                    />
                    <WebButton
                      data-testid="add-column-button"
                      disabled={columnAddSaveDisabled}
                      type="submit"
                      variant="tertiary"
                    >
                      {isAddingColumn ? "추가 중..." : "끼니 추가"}
                    </WebButton>
                  </form>
                ) : null}
              </WebCard>
              {columnAddError ? (
                <p className="web-form-error" data-testid="add-column-error">
                  {columnAddError}
                </p>
              ) : null}
            </>
          )}
        </section>

        <section
          className="web-settings-section web-settings-bordered-section"
          data-testid="settings-cook-mode-section"
        >
          <h2>요리 모드</h2>
          <WebCard className="web-settings-row-card">
            <div>
              <strong>요리모드 화면 켜둠</strong>
              <span>요리 중 레시피를 보는 동안 화면이 꺼지지 않아요.</span>
            </div>
            <button
              aria-checked={profile?.settings.screen_wake_lock ?? false}
              aria-label="요리모드 화면 켜둠"
              className={
                profile?.settings.screen_wake_lock
                  ? "web-switch web-switch-on"
                  : "web-switch"
              }
              onClick={() => void handleToggleWakeLock()}
              role="switch"
              type="button"
            >
              <span />
            </button>
          </WebCard>
        </section>

        <section
          className="web-settings-section web-settings-bordered-section"
          data-testid="settings-account-section"
        >
          <h2>계정</h2>
          <WebCard className="web-settings-account-card">
            <div className="web-settings-account-row">
              <SettingsAccountAvatar profile={profile} />
              <span>
                <strong>{profile?.nickname ?? ""}</strong>
                <em>{profile?.social_provider === "kakao" ? "카카오 로그인" : "소셜 로그인"}</em>
              </span>
            </div>
            <div className="px-4">
              <LinkedAuthProviders />
            </div>
            <button
              className="web-settings-account-row web-settings-account-action"
              onClick={() => setShowLogoutDialog(true)}
              type="button"
            >
              <span className="web-settings-account-icon"><LogoutMiniIcon /></span>
              <span>
                <strong>로그아웃</strong>
                <em>현재 로그인한 계정에서 나가요.</em>
              </span>
              <ChevronRightIcon />
            </button>
          </WebCard>
        </section>

        <section
          className="web-settings-section web-settings-bordered-section web-settings-danger-section"
          data-testid="settings-danger-section"
        >
          <h2>위험 영역</h2>
          <WebCard className="web-settings-danger-card">
            <div>
              <strong>계정 삭제</strong>
              <span>개인 기록은 삭제되고, 공개한 사용자 등록 완제품은 익명 읽기 전용으로 남아 기존 식단 기록을 보호해요.</span>
            </div>
            <WebButton
              className="web-settings-danger-button"
              onClick={() => setShowDeleteDialog(true)}
            >
              계정 삭제하기
            </WebButton>
          </WebCard>
        </section>
      </main>

      {showLogoutDialog ? (
        <ConfirmDialog
          confirmLabel={isLoggingOut ? "로그아웃 중..." : "로그아웃"}
          confirmTone="brand"
          description="다시 로그인해야 식단·팬트리가 동기화돼요."
          disabled={isLoggingOut}
          errorMessage={logoutError}
          onCancel={() => {
            setShowLogoutDialog(false);
            setLogoutError(null);
          }}
          onConfirm={() => void handleLogout()}
          title="로그아웃 할까요?"
        />
      ) : null}

      {showDeleteDialog ? (
        <ConfirmDialog
          confirmLabel={isDeleting ? "탈퇴 처리 중..." : "탈퇴하기"}
          confirmTone="danger"
          description="레시피북, 플래너, 장보기, 팬트리 등 개인 기록은 삭제되며 되돌릴 수 없어요. 공개한 사용자 등록 완제품은 등록자 정보 없이 읽기 전용으로 남아 다른 사용자의 기존 식단 기록을 보호해요."
          disabled={isDeleting}
          errorMessage={deleteError}
          onCancel={() => {
            setShowDeleteDialog(false);
            setDeleteError(null);
          }}
          onConfirm={() => void handleDeleteAccount()}
          title="정말 계정을 삭제할까요?"
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
          confirmLabel={isDeletingColumn ? "삭제 중..." : "끼니 삭제"}
          confirmTone="danger"
          description={`"${deleteColumnTarget.name}" 끼니를 삭제할까요? 식사가 있으면 삭제되지 않아요.`}
          disabled={isDeletingColumn}
          errorMessage={deleteColumnError}
          onCancel={() => {
            setDeleteColumnTarget(null);
            setDeleteColumnError(null);
          }}
          onConfirm={() => void handleDeleteColumn()}
          title="끼니 삭제"
        />
      ) : null}
    </WebShell>
  );
}

function SettingsAppBar() {
  const appReturn = useAppReturn({ fallback: "/mypage" });

  return (
    <div className="flex h-14 items-center border-b border-[var(--line)] bg-[var(--background)] px-2">
      <AppBackButton onClick={appReturn.goBack} />
      <h1 className="flex-1 text-center text-xl font-extrabold text-[var(--foreground)]">
        환경설정
      </h1>
      <AppBackButtonSpacer />
    </div>
  );
}

function SettingsMobileLoadingShell() {
  const appReturn = useAppReturn({ fallback: "/mypage" });
  const title = "환경설정";

  return (
    <div
      className="min-h-dvh bg-[var(--surface-fill)] pb-[calc(24px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden"
      data-testid="settings-mobile-loading"
    >
      <div
        className="sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center justify-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-4"
        style={{ borderBottomWidth: "0.5px" }}
      >
        <AppBackButton
          className="absolute left-4 top-1/2 -translate-y-1/2"
          onClick={appReturn.goBack}
        />
        <h1 className="truncate text-center text-[18px] font-extrabold leading-none text-[var(--foreground)]">
          {title}
        </h1>
      </div>
      <main className={SETTINGS_MOBILE_MAIN_CLASS} data-testid="settings-loading">
        <section
          aria-label="끼니 관리 로딩"
          className={`${SETTINGS_MOBILE_SECTION_CLASS} min-h-[342px]`}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <Skeleton className="h-[22px] w-[86px]" />
            <Skeleton className="h-8 w-[74px] rounded-[var(--radius-control)]" />
          </div>
          <SettingsMobileColumnLoadingContent />
        </section>

        <section
          aria-label="요리 모드 로딩"
          className={`${SETTINGS_MOBILE_SECTION_CLASS} min-h-[133px]`}
        >
          <Skeleton className="mb-2.5 h-[22px] w-[82px]" />
          <SettingsMobileToggleLoadingRow />
        </section>

        <section
          aria-label="계정 로딩"
          className={SETTINGS_MOBILE_SECTION_CLASS}
        >
          <Skeleton className="mb-2 h-[22px] w-12" />
          <SettingsMobileAccountLoadingCard />
        </section>

        <section
          aria-label="위험 영역 로딩"
          className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--feedback-danger-soft)] p-4"
        >
          <Skeleton className="mb-2 h-[22px] w-[82px]" />
          <SettingsMobileDangerLoadingContent />
        </section>
      </main>
    </div>
  );
}

function SettingsDesktopLoadingShell() {
  return (
    <WebShell className="web-settings-shell" wide>
      <WebTopNav
        activeId="mypage"
        rightSlot={<WebSkeleton className="web-mypage-top-profile" />}
      />
      <main
        aria-busy="true"
        className="web-settings-screen"
        data-testid="settings-loading"
      >
        <nav aria-label="설정 경로" className="web-breadcrumb">
          <Link className="web-breadcrumb-link" href={MYPAGE_PREFERENCES_HREF}>
            ‹ 마이페이지
          </Link>
          <span className="web-breadcrumb-sep">/</span>
          <span className="web-breadcrumb-current">환경설정</span>
        </nav>

        <div className="web-settings-header">
          <h1>환경설정</h1>
          <p>끼니 관리, 요리모드 화면 켜둠, 계정 상태를 관리해요.</p>
        </div>

        <section className="web-settings-section" aria-label="끼니 관리 로딩">
          <div className="web-settings-section-title">
            <h2>끼니 관리</h2>
            <p>플래너에 표시되는 식사 시간대를 관리해요.</p>
          </div>
          <WebCard className="web-settings-column-card">
            <div className="web-settings-column-list">
              {[112, 96, 104].map((width, index) => (
                <div className="web-settings-column-row" key={index}>
                  <WebSkeleton height={18} width={width} />
                  <WebSkeleton height={34} width={34} />
                </div>
              ))}
            </div>
          </WebCard>
        </section>

        {["요리 모드", "계정"].map((title, index) => (
          <section
            aria-label={`${title} 로딩`}
            className="web-settings-section"
            key={title}
          >
            <h2>{title}</h2>
            <WebCard
              className={
                index === 1
                  ? "web-settings-account-card"
                  : "web-settings-row-card"
              }
            >
              {index === 1 ? (
                <>
                  {[0, 1, 2].map((row) => (
                    <div className="web-settings-account-row" key={row}>
                      <WebSkeleton height={40} width={40} />
                      <span>
                        <WebSkeleton height={18} width={132} />
                        <WebSkeleton height={14} width={184} />
                      </span>
                      <WebSkeleton height={18} width={18} />
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div>
                    <WebSkeleton height={18} width={150} />
                    <WebSkeleton height={14} width={220} />
                  </div>
                  <WebSkeleton height={34} width={index === 0 ? 52 : 176} />
                </>
              )}
            </WebCard>
          </section>
        ))}
      </main>
    </WebShell>
  );
}

function SettingsProfilePill({ nickname }: { nickname?: string }) {
  return (
    <Link
      aria-label={`${nickname ?? "내"} 마이페이지`}
      className="web-mypage-top-profile"
      href={MYPAGE_PREFERENCES_HREF}
    >
      <span aria-hidden="true">{nickname?.slice(0, 1).toUpperCase() ?? "?"}</span>
    </Link>
  );
}

function SettingsAccountAvatar({ profile }: { profile: UserProfileData | null }) {
  const fallbackInitial = profile?.nickname?.slice(0, 1).toUpperCase() ?? "?";

  if (profile?.profile_image_url) {
    return (
      <Image
        alt=""
        className="web-settings-account-avatar"
        data-testid="settings-account-profile-image"
        height={36}
        src={profile.profile_image_url}
        unoptimized
        width={36}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="web-settings-account-avatar web-settings-account-avatar-fallback"
      data-testid="settings-account-profile-fallback"
    >
      {fallbackInitial}
    </span>
  );
}

interface PlannerColumnReorderResult {
  nextColumns: PlannerColumnData[];
  nextIndex: number;
  previousColumns: PlannerColumnData[];
}

function reorderPlannerColumns(
  columns: PlannerColumnData[],
  columnId: string,
  targetIndex: number,
): PlannerColumnReorderResult | null {
  const previousColumns = [...columns].sort((a, b) => a.sort_order - b.sort_order);
  const currentIndex = previousColumns.findIndex((column) => column.id === columnId);

  if (currentIndex < 0 || previousColumns.length <= 1) {
    return null;
  }

  const nextIndex = Math.max(0, Math.min(targetIndex, previousColumns.length - 1));

  if (nextIndex === currentIndex) {
    return null;
  }

  const movedColumns = [...previousColumns];
  const [movedColumn] = movedColumns.splice(currentIndex, 1);

  if (!movedColumn) {
    return null;
  }

  movedColumns.splice(nextIndex, 0, movedColumn);

  return {
    nextColumns: movedColumns.map((column, index) => ({
      ...column,
      sort_order: index,
    })),
    nextIndex,
    previousColumns,
  };
}

function DragHandleIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M8 7h.01M8 12h.01M8 17h.01M16 7h.01M16 12h.01M16 17h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    </svg>
  );
}

function ReorderArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      aria-hidden="true"
      className="web-settings-reorder-icon"
      fill="none"
      viewBox="0 0 12 12"
    >
      <path
        d={direction === "up" ? "M6 3.25 3.25 6h5.5L6 3.25Z" : "M6 8.75 3.25 6h5.5L6 8.75Z"}
        fill="currentColor"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function LogoutMiniIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M10 17 15 12l-5-5M15 12H3M21 4v16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
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
    <WebModal onBackdropClick={onCancel}>
      <WebDialog
        aria-labelledby="settings-confirm-title"
        className="web-confirm-dialog"
        role="alertdialog"
        size="narrow"
      >
        <WebDialogHeader>
          <WebDialogTitle id="settings-confirm-title">{title}</WebDialogTitle>
          <WebIconButton aria-label="닫기" disabled={disabled} onClick={onCancel}>
            ×
          </WebIconButton>
        </WebDialogHeader>
        <WebDialogBody>
          <div className="web-confirm-body">
            <span
              aria-hidden="true"
              className={
                confirmTone === "danger"
                  ? "web-confirm-icon web-confirm-icon-danger"
                  : "web-confirm-icon"
              }
            >
              {confirmTone === "danger" ? "!" : "↪"}
            </span>
            <p className="web-confirm-copy">
              {description ?? "현재 로그인한 계정에서 나가요."}
            </p>
          </div>
          {errorMessage ? (
            <p className="web-form-error" data-testid="dialog-error">
              {errorMessage}
            </p>
          ) : null}
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton disabled={disabled} onClick={onCancel} variant="tertiary">
            취소
          </WebButton>
          <WebButton
            className={confirmTone === "danger" ? "web-confirm-danger" : confirmBg}
            disabled={disabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)] p-4 lg:items-center"
      data-testid={`${testIdPrefix}-sheet-backdrop`}
      onClick={onClose}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-t-[var(--radius-xl)] bg-[var(--panel)] p-6 shadow-[var(--shadow-3)] lg:rounded-[var(--radius-xl)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[var(--line)] lg:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--foreground)]" id={titleId}>
            {title}
          </h2>
          <button
            aria-label="닫기"
            className="flex h-[var(--control-height-md)] w-11 items-center justify-center text-[var(--text-3)]"
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
          className={`w-full rounded-[var(--radius-sm)] border bg-[var(--surface-fill)] px-4 py-3 text-base font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--brand)] ${
            errorMessage
              ? "border-[var(--danger)]"
              : "border-[var(--line-strong)] focus:border-[var(--brand)]"
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
          className={`mt-4 flex w-full min-h-[var(--control-height-xl)] items-center justify-center rounded-[var(--radius-md)] text-base font-semibold ${
            saveDisabled
              ? "bg-[var(--surface-subtle)] text-[var(--text-4)]"
              : "bg-[var(--brand)] text-[var(--text-inverse)]"
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
