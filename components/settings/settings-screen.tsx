"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ContentState } from "@/components/shared/content-state";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import {
  SettingsMobileScreen,
  type SettingsMobileSurface,
} from "@/components/settings/settings-mobile-screen";
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
  WebTopNav,
} from "@/components/web";
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

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "탐색" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

const MYPAGE_ACCOUNT_HREF = "/mypage?tab=account";

export interface SettingsScreenProps {
  initialAuthenticated?: boolean;
}

export function SettingsScreen({
  initialAuthenticated = false,
}: SettingsScreenProps) {
  const router = useRouter();
  const isMobileViewport = useIsMobileViewport();
  const [mobileSurface, setMobileSurface] =
    useState<SettingsMobileSurface>("settings");

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
  const [columnsEditMode, setColumnsEditMode] = useState(false);

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
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setMobileSurface(params.get("view") === "account" ? "account" : "settings");
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
      setColumnsEditMode(false);
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
    if (isMobileViewport) {
      return <SettingsMobileLoadingShell surface={mobileSurface} />;
    }

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
      return <SettingsMobileLoadingShell surface={mobileSurface} />;
    }

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
            className="mt-4 flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white"
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
        isAddingColumn={isAddingColumn}
        isDeleting={isDeleting}
        isDeletingColumn={isDeletingColumn}
        isLoggingOut={isLoggingOut}
        isRenamingColumn={isRenamingColumn}
        isSavingNickname={isSavingNickname}
        logoutError={logoutError}
        nicknameError={nicknameError}
        nicknameInput={nicknameInput}
        nicknameSaveDisabled={nicknameSaveDisabled}
        plannerColumns={plannerColumns}
        profile={profile}
        renameTarget={renameTarget}
        showColumnAddSheet={showColumnAddSheet}
        showDeleteDialog={showDeleteDialog}
        showLogoutDialog={showLogoutDialog}
        showNicknameSheet={showNicknameSheet}
        surface={mobileSurface}
        onAddColumn={() => void handleAddColumn()}
        onCloseColumnAddSheet={() => {
          setShowColumnAddSheet(false);
          setColumnAddError(null);
        }}
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
        onCloseNicknameSheet={() => {
          setShowNicknameSheet(false);
          setNicknameError(null);
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
        onOpenColumnAddSheet={() => {
          setColumnAddError(null);
          setShowColumnAddSheet(true);
        }}
        onOpenDeleteDialog={() => {
          setDeleteError(null);
          setShowDeleteDialog(true);
        }}
        onOpenLogoutDialog={() => {
          setLogoutError(null);
          setShowLogoutDialog(true);
        }}
        onOpenNicknameSheet={openNicknameSheet}
        onRenameColumn={() => void handleRenameColumn()}
        onRenameColumnTarget={openColumnRenameSheet}
        onRetryColumns={() => void loadColumns()}
        onSaveNickname={() => void handleSaveNickname()}
        onToggleWakeLock={() => void handleToggleWakeLock()}
        onNicknameInputChange={(value) => {
          setNicknameInput(value);
          setNicknameError(null);
        }}
      />
    );
  }

  return (
    <WebShell className="web-settings-shell" wide>
      <WebTopNav
        activeId="mypage"
        items={WEB_NAV_ITEMS}
        rightSlot={<SettingsProfilePill nickname={profile?.nickname} />}
      />
      <main className="web-settings-screen">
        <nav aria-label="설정 경로" className="web-breadcrumb">
          <Link className="web-breadcrumb-link" href={MYPAGE_ACCOUNT_HREF}>
            ‹ 마이페이지
          </Link>
          <span className="web-breadcrumb-sep">/</span>
          <span className="web-breadcrumb-current">설정</span>
        </nav>

        <div className="web-settings-header">
          <h1>설정</h1>
          <p>알림 · 단위 · 테마를 한곳에서 관리합니다.</p>
        </div>

        {errorMessage ? (
          <div
            className="web-settings-toast"
            data-testid="settings-error-toast"
            role="status"
          >
            {errorMessage}
          </div>
        ) : null}

        <section className="web-settings-section" data-testid="column-management-section">
          <div className="web-settings-section-title">
            <h2>끼니 관리</h2>
            <p>플래너에 표시되는 식사 시간대를 관리합니다.</p>
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
                  {plannerColumns.map((column) => (
                    <div
                      className="web-settings-column-row"
                      data-testid={`column-item-${column.id}`}
                      key={column.id}
                    >
                      <span aria-hidden="true" className="web-settings-drag">::</span>
                      <strong>{column.name}</strong>
                      <span className="web-settings-default-badge">기본</span>
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
                          aria-label={`${column.name} 삭제`}
                          className="web-settings-icon-button web-settings-icon-danger"
                          data-testid={`delete-column-${column.id}`}
                          disabled={plannerColumns.length <= 1}
                          onClick={() => setDeleteColumnTarget(column)}
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </WebCard>
              <div className="web-settings-column-actions">
                <WebButton
                  data-testid="add-column-button"
                  disabled={plannerColumns.length >= 5}
                  onClick={() => {
                    setColumnAddInput("");
                    setColumnAddError(null);
                    setShowColumnAddSheet(true);
                  }}
                  variant="tertiary"
                >
                  + 끼니 추가
                </WebButton>
                {!columnsLoading && !columnsError ? (
                  <WebButton
                    onClick={() => setColumnsEditMode((current) => !current)}
                    variant="ghost"
                  >
                    {columnsEditMode ? "완료" : "편집"}
                  </WebButton>
                ) : null}
              </div>
              <p className="web-settings-help">
                최소 2개, 최대 5개의 끼니를 등록할 수 있어요.
                기본 끼니(아침/점심/저녁)는 삭제할 수 없어요.
                컬럼을 추가하면 플래너 그리드에도 같은 순서로 표시됩니다.
              </p>
            </>
          )}
        </section>

        <section className="web-settings-section">
          <h2>알림</h2>
          <WebCard className="web-settings-row-card">
            <div>
              <strong>푸시 알림</strong>
              <span>끼니 요리 시간, 장보기 리마인드</span>
              <span className="visually-hidden">요리모드 화면 꺼짐 방지</span>
            </div>
            <button
              aria-checked={profile?.settings.screen_wake_lock ?? false}
              aria-label="요리모드 화면 꺼짐 방지"
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

        <section className="web-settings-section">
          <h2>단위</h2>
          <WebCard className="web-settings-row-card">
            <div>
              <strong>계량 단위</strong>
              <span>미터법 (g, ml) 또는 컵·큰술 표기</span>
            </div>
            <div className="web-settings-segmented">
              <button className="active" type="button">미터법</button>
              <button type="button">컵·큰술</button>
            </div>
          </WebCard>
        </section>

        <section className="web-settings-section">
          <h2>테마</h2>
          <WebCard className="web-settings-row-card">
            <div>
              <strong>앱 테마</strong>
              <span>시스템 설정 따라가기를 권장합니다</span>
            </div>
            <div className="web-settings-segmented web-settings-segmented-3">
              <button className="active" type="button">라이트</button>
              <button type="button">다크</button>
              <button type="button">시스템</button>
            </div>
          </WebCard>
        </section>

        <section className="web-settings-section">
          <h2>계정</h2>
          <WebCard className="web-settings-account-card">
            <div className="web-settings-account-row">
              <span className="web-settings-account-icon"><UserMiniIcon /></span>
              <span>
                <strong>{profile?.nickname ?? ""}</strong>
                <em>{profile?.social_provider === "kakao" ? "카카오 로그인" : "소셜 로그인"}</em>
              </span>
            </div>
            <button
              aria-label={`닉네임 변경, 현재 닉네임: ${profile?.nickname ?? ""}`}
              className="web-settings-account-row web-settings-account-action"
              data-testid="nickname-row"
              onClick={openNicknameSheet}
              type="button"
            >
              <span className="web-settings-account-icon"><PencilIcon /></span>
              <span>
                <strong>닉네임 변경</strong>
                <span className="visually-hidden">닉네임</span>
                <em>마이페이지와 댓글에 표시되는 이름</em>
              </span>
              <ChevronRightIcon />
            </button>
            <button
              className="web-settings-account-row web-settings-account-action"
              onClick={() => setShowLogoutDialog(true)}
              type="button"
            >
              <span className="web-settings-account-icon"><LogoutMiniIcon /></span>
              <span>
                <strong>로그아웃</strong>
                <em>현재 로그인한 계정에서 나갑니다.</em>
              </span>
              <ChevronRightIcon />
            </button>
          </WebCard>
        </section>

        <section className="web-settings-section web-settings-danger-section">
          <h2>위험 영역</h2>
          <WebCard className="web-settings-danger-card">
            <div>
              <strong>계정 삭제</strong>
              <span>모든 레시피북, 플래너, 장보기 기록이 영구적으로 삭제됩니다.</span>
            </div>
            <WebButton
              className="web-settings-danger-button"
              onClick={() => setShowDeleteDialog(true)}
            >
              계정 삭제하기
            </WebButton>
            <button className="visually-hidden" onClick={() => setShowDeleteDialog(true)} type="button">
              회원탈퇴
            </button>
          </WebCard>
        </section>
      </main>

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
          confirmLabel={isLoggingOut ? "로그아웃 중..." : "로그아웃"}
          confirmTone="brand"
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
          confirmLabel={isDeleting ? "삭제 중..." : "계정 삭제"}
          confirmTone="danger"
          description="계정을 삭제하면 모든 레시피북, 플래너, 장보기 기록이 삭제되며 되돌릴 수 없어요."
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
    </WebShell>
  );
}

function SettingsAppBar() {
  const appReturn = useAppReturn({ fallback: "/mypage" });

  return (
    <div className="flex h-14 items-center border-b border-[var(--line)] bg-[var(--background)] px-2">
      <button
        aria-label="뒤로가기"
        className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center"
        onClick={appReturn.goBack}
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
      <div className="h-[var(--control-height-md)] w-11 shrink-0" />
    </div>
  );
}

function SettingsMobileLoadingShell({
  surface,
}: {
  surface: SettingsMobileSurface;
}) {
  const appReturn = useAppReturn({ fallback: "/mypage" });
  const title = surface === "account" ? "계정 정보" : "설정";

  return (
    <div
      className="min-h-dvh bg-[#F8F9FA] pb-[calc(24px+env(safe-area-inset-bottom))] text-[#212529] lg:hidden"
      data-testid="settings-mobile-loading"
    >
      <div
        className="sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center justify-center border-b border-[#DEE2E6] bg-white px-4"
        style={{ borderBottomWidth: "0.5px" }}
      >
        <button
          aria-label="뒤로가기"
          className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start border-0 bg-transparent p-0 text-[#212529]"
          onClick={appReturn.goBack}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.3"
            viewBox="0 0 24 24"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="truncate text-center text-[18px] font-extrabold leading-none text-[#212529]">
          {title}
        </h1>
      </div>
      <div className="space-y-4 p-4" data-testid="settings-loading">
        <section className="rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-7 w-12 rounded-full" />
          </div>
        </section>
        <section className="rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white p-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-5 w-28" />
          </div>
        </section>
        <section className="rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white p-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-36" />
          </div>
        </section>
      </div>
    </div>
  );
}

function SettingsProfilePill({ nickname }: { nickname?: string }) {
  return (
    <Link
      aria-label={`${nickname ?? "내"} 마이페이지`}
      className="web-mypage-top-profile"
      href={MYPAGE_ACCOUNT_HREF}
    >
      <span aria-hidden="true">{nickname?.slice(0, 1).toUpperCase() ?? "?"}</span>
    </Link>
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

function UserMiniIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M20 21a8 8 0 1 0-16 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
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
    <WebModal data-testid="nickname-sheet-backdrop" onBackdropClick={onClose}>
      <WebDialog aria-labelledby="settings-nickname-title" size="narrow">
        <WebDialogHeader>
          <WebDialogTitle id="settings-nickname-title">
            닉네임 변경
          </WebDialogTitle>
          <WebIconButton aria-label="닫기" onClick={onClose}>
            ×
          </WebIconButton>
        </WebDialogHeader>
        <WebDialogBody>
          <label className="web-form-label" htmlFor="settings-nickname-input">
            새 닉네임
          </label>
          <input
            aria-describedby={errorMessage ? `${inputHelpId} ${inputErrorId}` : inputHelpId}
            autoFocus
            className="web-form-input"
            id="settings-nickname-input"
            maxLength={30}
            onChange={(e) => onInputChange(e.target.value)}
            type="text"
            value={nicknameInput}
          />
          <p className="web-form-help" id={inputHelpId}>
            한글·영문·숫자 2-30자
          </p>
          {errorMessage ? (
            <p className="web-form-error" data-testid="nickname-error" id={inputErrorId}>
              {errorMessage}
            </p>
          ) : null}
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton onClick={onClose} variant="tertiary">취소</WebButton>
          <WebButton disabled={saveDisabled} onClick={onSave}>
            {isSaving ? "변경 중..." : "변경하기"}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
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
              {description ?? "현재 로그인한 계정에서 나갑니다."}
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 lg:items-center"
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
          className={`mt-4 flex w-full min-h-[var(--control-height-xl)] items-center justify-center rounded-[var(--radius-md)] text-base font-semibold ${
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
