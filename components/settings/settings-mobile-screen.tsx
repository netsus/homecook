"use client";

import Image from "next/image";
import { LinkedAuthProviders } from "@/components/auth/linked-auth-providers";
import React from "react";

import { AppBackButton } from "@/components/shared/app-back-button";
import { AppFeedbackToast } from "@/components/shared/app-feedback-toast";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { SettingsMobileColumnLoadingContent } from "@/components/settings/settings-mobile-loading";
import type { UserProfileData } from "@/lib/api/mypage";
import type { PlannerColumnData } from "@/types/planner";

export type SettingsMobileSurface = "settings" | "account";
type SettingsFeedbackTone = "success" | "danger";

interface SettingsMobileScreenProps {
  columnAddError: string | null;
  columnAddInput: string;
  columnAddSaveDisabled: boolean;
  columnRenameError: string | null;
  columnRenameInput: string;
  columnRenameSaveDisabled: boolean;
  columnsEditMode: boolean;
  columnsError: string | null;
  columnsLoading: boolean;
  deleteColumnError: string | null;
  deleteColumnTarget: PlannerColumnData | null;
  deleteError: string | null;
  errorMessage: string | null;
  feedbackMessage: { message: string; tone: SettingsFeedbackTone } | null;
  logoutError: string | null;
  isAddingColumn: boolean;
  isDeleting: boolean;
  isDeletingColumn: boolean;
  isLoggingOut: boolean;
  isRenamingColumn: boolean;
  plannerColumns: PlannerColumnData[];
  profile: UserProfileData | null;
  renameTarget: PlannerColumnData | null;
  showDeleteDialog: boolean;
  showLogoutDialog: boolean;
  surface: SettingsMobileSurface;
  onAddColumn: () => void;
  onCloseDeleteColumnDialog: () => void;
  onCloseDeleteDialog: () => void;
  onCloseLogoutDialog: () => void;
  onCloseRenameColumnSheet: () => void;
  onColumnsEditModeChange: (editing: boolean) => void;
  onColumnAddInputChange: (value: string) => void;
  onColumnRenameInputChange: (value: string) => void;
  onConfirmDelete: () => void;
  onConfirmDeleteColumn: () => void;
  onConfirmLogout: () => void;
  onDeleteColumnTarget: (column: PlannerColumnData) => void;
  onMoveColumn: (columnId: string, targetIndex: number) => void;
  onOpenDeleteDialog: () => void;
  onOpenLogoutDialog: () => void;
  onRenameColumn: () => void;
  onRenameColumnTarget: (column: PlannerColumnData) => void;
  onRetryColumns: () => void;
  onToggleWakeLock: () => void;
}

export function SettingsMobileScreen({
  columnAddError,
  columnAddInput,
  columnAddSaveDisabled,
  columnRenameError,
  columnRenameInput,
  columnRenameSaveDisabled,
  columnsEditMode,
  columnsError,
  columnsLoading,
  deleteColumnError,
  deleteColumnTarget,
  deleteError,
  errorMessage,
  feedbackMessage,
  logoutError,
  isAddingColumn,
  isDeleting,
  isDeletingColumn,
  isLoggingOut,
  isRenamingColumn,
  plannerColumns,
  profile,
  renameTarget,
  showDeleteDialog,
  showLogoutDialog,
  onAddColumn,
  onCloseDeleteColumnDialog,
  onCloseDeleteDialog,
  onCloseLogoutDialog,
  onCloseRenameColumnSheet,
  onColumnsEditModeChange,
  onColumnAddInputChange,
  onColumnRenameInputChange,
  onConfirmDelete,
  onConfirmDeleteColumn,
  onConfirmLogout,
  onDeleteColumnTarget,
  onMoveColumn,
  onOpenDeleteDialog,
  onOpenLogoutDialog,
  onRenameColumn,
  onRenameColumnTarget,
  onRetryColumns,
  onToggleWakeLock,
}: SettingsMobileScreenProps) {
  const title = "환경설정";
  const appReturn = useAppReturn({ fallback: "/mypage" });
  const readyToast = feedbackMessage ?? (
    errorMessage ? { message: errorMessage, tone: "danger" as const } : null
  );

  return (
    <div className="min-h-dvh bg-[var(--surface-fill)] pb-[calc(24px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden">
      <MobileAppBar
        onBack={appReturn.goBack}
        title={title}
      />

      {readyToast ? (
        <AppFeedbackToast
          message={readyToast.message}
          position="mobileTop"
          testId="settings-error-toast"
          tone={readyToast.tone === "danger" ? "error" : "success"}
        />
      ) : null}

      <SettingsSurface
        columnAddError={columnAddError}
        columnAddInput={columnAddInput}
        columnAddSaveDisabled={columnAddSaveDisabled}
        columnsEditMode={columnsEditMode}
        columnsError={columnsError}
        columnsLoading={columnsLoading}
        isAddingColumn={isAddingColumn}
        plannerColumns={plannerColumns}
        profile={profile}
        onAddColumn={onAddColumn}
        onColumnAddInputChange={onColumnAddInputChange}
        onColumnsEditModeChange={onColumnsEditModeChange}
        onDeleteColumnTarget={onDeleteColumnTarget}
        onMoveColumn={onMoveColumn}
        onOpenDeleteDialog={onOpenDeleteDialog}
        onOpenLogoutDialog={onOpenLogoutDialog}
        onRenameColumnTarget={onRenameColumnTarget}
        onRetryColumns={onRetryColumns}
        onToggleWakeLock={onToggleWakeLock}
      />

      {showLogoutDialog ? (
        <MobileConfirmSheet
          confirmLabel={isLoggingOut ? "로그아웃 중..." : "로그아웃"}
          description="다시 로그인해야 식단·팬트리가 동기화돼요."
          disabled={isLoggingOut}
          errorMessage={logoutError}
          idPrefix="settings-logout"
          onCancel={onCloseLogoutDialog}
          onConfirm={onConfirmLogout}
          title="로그아웃 할까요?"
        />
      ) : null}

      {showDeleteDialog ? (
        <MobileConfirmSheet
          confirmLabel={isDeleting ? "탈퇴 처리 중..." : "탈퇴하기"}
          destructive
          description="레시피북, 플래너, 장보기, 팬트리 등 개인 기록은 삭제되며 되돌릴 수 없어요. 공개한 사용자 등록 완제품은 등록자 정보 없이 읽기 전용으로 남아 다른 사용자의 기존 식단 기록을 보호해요."
          disabled={isDeleting}
          errorMessage={deleteError}
          extraWarning="삭제 후 같은 소셜 계정으로 다시 로그인해도 이전 개인 기록은 복구되지 않아요."
          idPrefix="settings-delete"
          onCancel={onCloseDeleteDialog}
          onConfirm={onConfirmDelete}
          title="정말 계정을 삭제할까요?"
        />
      ) : null}

      {renameTarget ? (
        <MobileColumnNameSheet
          errorMessage={columnRenameError}
          inputValue={columnRenameInput}
          isSaving={isRenamingColumn}
          onClose={onCloseRenameColumnSheet}
          onInputChange={onColumnRenameInputChange}
          onSave={onRenameColumn}
          saveDisabled={columnRenameSaveDisabled}
          testIdPrefix="rename-column"
          title="끼니 이름 변경"
        />
      ) : null}

      {deleteColumnTarget ? (
        <MobileConfirmSheet
          confirmLabel={isDeletingColumn ? "삭제 중..." : "끼니 삭제"}
          destructive
          description={`"${deleteColumnTarget.name}" 끼니를 삭제할까요? 식사가 있으면 삭제되지 않아요.`}
          disabled={isDeletingColumn}
          errorMessage={deleteColumnError}
          idPrefix="settings-delete-column"
          onCancel={onCloseDeleteColumnDialog}
          onConfirm={onConfirmDeleteColumn}
          title="끼니 삭제"
        />
      ) : null}
    </div>
  );
}

function MobileAppBar({
  onBack,
  title,
}: {
  onBack: () => void;
  title: string;
}) {
  return (
    <div
      className="sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center justify-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-4"
      style={{ borderBottomWidth: "0.5px" }}
    >
      <AppBackButton
        className="absolute left-4 top-1/2 -translate-y-1/2"
        onClick={onBack}
      />
      <h1 className="truncate text-center text-[18px] font-extrabold leading-none text-[var(--foreground)]">
        {title}
      </h1>
    </div>
  );
}

function SettingsSurface({
  columnAddError,
  columnAddInput,
  columnAddSaveDisabled,
  columnsEditMode,
  columnsError,
  columnsLoading,
  isAddingColumn,
  plannerColumns,
  profile,
  onAddColumn,
  onColumnAddInputChange,
  onColumnsEditModeChange,
  onDeleteColumnTarget,
  onMoveColumn,
  onOpenDeleteDialog,
  onOpenLogoutDialog,
  onRenameColumnTarget,
  onRetryColumns,
  onToggleWakeLock,
}: {
  columnAddError: string | null;
  columnAddInput: string;
  columnAddSaveDisabled: boolean;
  columnsEditMode: boolean;
  columnsError: string | null;
  columnsLoading: boolean;
  isAddingColumn: boolean;
  plannerColumns: PlannerColumnData[];
  profile: UserProfileData | null;
  onAddColumn: () => void;
  onColumnAddInputChange: (value: string) => void;
  onColumnsEditModeChange: (editing: boolean) => void;
  onDeleteColumnTarget: (column: PlannerColumnData) => void;
  onMoveColumn: (columnId: string, targetIndex: number) => void;
  onOpenDeleteDialog: () => void;
  onOpenLogoutDialog: () => void;
  onRenameColumnTarget: (column: PlannerColumnData) => void;
  onRetryColumns: () => void;
  onToggleWakeLock: () => void;
}) {
  const [draggingColumnId, setDraggingColumnId] = React.useState<string | null>(null);

  const handleDropColumn = React.useCallback((targetColumnId: string) => {
    if (!draggingColumnId || draggingColumnId === targetColumnId) {
      setDraggingColumnId(null);
      return;
    }

    const targetIndex = plannerColumns.findIndex((column) => column.id === targetColumnId);
    setDraggingColumnId(null);

    if (targetIndex >= 0) {
      onMoveColumn(draggingColumnId, targetIndex);
    }
  }, [draggingColumnId, onMoveColumn, plannerColumns]);

  return (
    <main className="space-y-3 px-4 pb-[calc(28px+env(safe-area-inset-bottom))] pt-4">
      <section
        className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4"
        data-testid="column-management-section"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-extrabold text-[var(--foreground)]">
            끼니 관리
          </h2>
          {!columnsLoading && !columnsError ? (
            <button
              className="web-settings-delete-button h-8 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--feedback-danger-soft)] px-3 text-[12px] font-extrabold text-[var(--danger)]"
              onClick={() => onColumnsEditModeChange(!columnsEditMode)}
              type="button"
            >
              {columnsEditMode ? "완료" : "끼니 삭제"}
            </button>
          ) : null}
        </div>

        {columnsLoading ? (
          <SettingsMobileColumnLoadingContent />
        ) : columnsError ? (
          <div
            className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4"
            data-testid="columns-error"
          >
            <p className="text-[13px] font-bold text-[var(--danger)]">
              {columnsError}
            </p>
            <button
              className="mt-3 h-10 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-[13px] font-extrabold text-[var(--text-inverse)]"
              onClick={onRetryColumns}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2" data-testid="column-list">
              {plannerColumns.map((column, index) => (
                <div
                  className={[
                    "settings-column-row grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-fill)] p-2",
                    draggingColumnId === column.id ? "opacity-60" : "",
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
                    className="flex h-10 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-3)]"
                    data-testid={`column-drag-${column.id}`}
                    type="button"
                  >
                    <MobileDragHandleIcon />
                  </button>
                  <div
                    className="flex min-h-10 min-w-0 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3"
                    data-testid={`column-name-${column.id}`}
                  >
                    <strong className="min-w-0 truncate text-[14px] font-extrabold text-[var(--foreground)]">
                      {column.name}
                    </strong>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    <div className="grid gap-1">
                      <button
                        aria-label={`${column.name} 위로 이동`}
                        className="web-settings-reorder-button flex h-[18px] w-7 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] p-0 text-[var(--text-3)] disabled:opacity-35"
                        disabled={index === 0}
                        onClick={() => onMoveColumn(column.id, index - 1)}
                        type="button"
                      >
                        <MobileReorderArrowIcon direction="up" />
                      </button>
                      <button
                        aria-label={`${column.name} 아래로 이동`}
                        className="web-settings-reorder-button flex h-[18px] w-7 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] p-0 text-[var(--text-3)] disabled:opacity-35"
                        disabled={index === plannerColumns.length - 1}
                        onClick={() => onMoveColumn(column.id, index + 1)}
                        type="button"
                      >
                        <MobileReorderArrowIcon direction="down" />
                      </button>
                    </div>
                    <button
                      aria-label={`${column.name} 이름 변경`}
                      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--brand)]"
                      data-testid={`rename-column-${column.id}`}
                      onClick={() => onRenameColumnTarget(column)}
                      type="button"
                    >
                      <MobilePencilIcon />
                    </button>
                    {columnsEditMode ? (
                      <button
                        aria-label={`${column.name} 끼니 삭제`}
                        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--surface)] text-[var(--danger)] disabled:border-[var(--line-strong)] disabled:text-[var(--text-4)]"
                        data-testid={`delete-column-${column.id}`}
                        disabled={plannerColumns.length <= 1}
                        onClick={() => onDeleteColumnTarget(column)}
                        type="button"
                      >
                        <MobileTrashIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {plannerColumns.length < 5 ? (
              <form
                className="mt-3 grid grid-cols-1 gap-2 min-[390px]:grid-cols-[minmax(0,1fr)_104px]"
                onSubmit={(event) => {
                  event.preventDefault();
                  onAddColumn();
                }}
              >
                <input
                  aria-label="새 끼니 이름"
                  className="h-10 min-w-0 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-3 text-[14px] font-bold text-[var(--foreground)] outline-none placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-[var(--brand)]"
                  data-testid="add-column-input"
                  maxLength={30}
                  onChange={(event) => onColumnAddInputChange(event.target.value)}
                  placeholder="새 끼니 이름"
                  type="text"
                  value={columnAddInput}
                />
                <button
                  className="h-10 whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--brand)] px-3 text-[12px] font-extrabold text-[var(--text-inverse)] disabled:bg-[var(--line-strong)]"
                  data-testid="add-column-button"
                  disabled={columnAddSaveDisabled}
                  type="submit"
                >
                  {isAddingColumn ? "추가 중..." : "끼니 추가"}
                </button>
              </form>
            ) : null}
            {columnAddError ? (
              <p className="mt-2 text-[12px] font-bold text-[var(--danger)]" data-testid="add-column-error">
                {columnAddError}
              </p>
            ) : null}

            <p className="mt-2 text-[12px] font-medium text-[var(--text-3)]">
              끼니는 최대 5개까지 사용할 수 있어요. 드래그해서 바꾼 순서는 플래너에 그대로 표시돼요.
            </p>
          </>
        )}
      </section>

      <section className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4">
        <h2 className="mb-2.5 text-[18px] font-extrabold text-[var(--foreground)]">
          요리 모드
        </h2>
        <div>
          <SettingToggleRow
            checked={profile?.settings.screen_wake_lock ?? false}
            description="요리 중 레시피를 보는 동안 화면이 꺼지지 않아요."
            label="요리모드 화면 켜둠"
            onClick={onToggleWakeLock}
          />
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4">
        <h2 className="mb-2 text-[18px] font-extrabold text-[var(--foreground)]">
          계정
        </h2>
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]">
          <div className="flex min-h-[60px] w-full items-center gap-3 border-b border-[var(--surface-subtle)] px-4 text-left">
            {profile?.profile_image_url ? (
              <Image
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
                data-testid="settings-mobile-account-profile-image"
                height={36}
                src={profile.profile_image_url}
                unoptimized
                width={36}
              />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[14px] font-extrabold text-[var(--brand)]"
                data-testid="settings-mobile-account-profile-fallback"
              >
                {(profile?.nickname ?? "무먹러").slice(0, 1)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[15px] font-extrabold text-[var(--foreground)]">
                {profile?.nickname ?? "무먹러"}
              </strong>
              <em className="mt-0.5 block truncate text-[12px] font-medium not-italic text-[var(--text-3)]">
                {formatProviderLabel(profile?.social_provider)}
              </em>
            </span>
          </div>
          <button
            className="flex min-h-[54px] w-full items-center justify-between px-4 text-left text-[15px] font-bold text-[var(--foreground)]"
            onClick={onOpenLogoutDialog}
            type="button"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-fill)] text-[var(--text-3)]">
                <MobileLogoutIcon />
              </span>
              로그아웃
            </span>
            <span className="text-[18px] text-[var(--text-4)]">›</span>
          </button>
          <div className="px-4 pb-4">
            <LinkedAuthProviders />
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--feedback-danger-soft)] p-4">
        <h2 className="mb-2 text-[18px] font-extrabold text-[var(--foreground)]">
          위험 영역
        </h2>
        <div>
          <strong className="block text-[15px] font-extrabold text-[var(--danger)]">
            계정 삭제
          </strong>
          <p className="mt-1 text-[12px] font-medium leading-[1.45] text-[var(--text-3)]">
            개인 기록은 삭제되고, 공개한 사용자 등록 완제품은 등록자 정보 없이 읽기 전용으로 남아 다른 사용자의 기존 식단 기록을 보호해요.
          </p>
          <button
            className="mt-3 min-h-11 rounded-[var(--radius-control)] bg-[var(--danger)] px-4 text-[13px] font-extrabold text-[var(--text-inverse)]"
            onClick={onOpenDeleteDialog}
            type="button"
          >
            계정 삭제하기
          </button>
        </div>
      </section>
    </main>
  );
}

function SettingToggleRow({
  checked,
  description,
  disabled = false,
  label,
  onClick,
}: {
  checked: boolean;
  description?: string;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <div className="flex min-h-[54px] items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-extrabold leading-[1.3] text-[var(--foreground)]">
          {label}
        </p>
        {description ? (
          <p className="mt-0.5 text-[12px] font-medium leading-[1.35] text-[var(--text-3)]">
            {description}
          </p>
        ) : null}
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        className={[
          "relative h-7 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-[var(--brand)]" : "bg-[var(--line-strong)]",
        ].join(" ")}
        disabled={disabled}
        onClick={onClick}
        role="switch"
        type="button"
      >
        <span
          className={[
            "absolute left-0 top-0.5 h-6 w-6 rounded-full bg-[var(--surface)] shadow-[0_1px_3px_var(--overlay-20)] transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function formatProviderLabel(provider?: UserProfileData["social_provider"]) {
  if (provider === "kakao") return "카카오 로그인";
  if (provider === "naver") return "네이버 로그인";
  if (provider === "google") return "Google 로그인";
  return "소셜 로그인";
}

function MobilePencilIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function MobileDragHandleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M8 7h.01M8 12h.01M8 17h.01M16 7h.01M16 12h.01M16 17h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function MobileReorderArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      aria-hidden="true"
      className="web-settings-reorder-icon h-3 w-3"
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

function MobileLogoutIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M10 17 15 12l-5-5M15 12H3M21 4v16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function MobileTrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function MobileColumnNameSheet({
  errorMessage,
  inputValue,
  isSaving,
  onClose,
  onInputChange,
  onSave,
  saveDisabled,
  testIdPrefix,
  title,
}: {
  errorMessage: string | null;
  inputValue: string;
  isSaving: boolean;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onSave: () => void;
  saveDisabled: boolean;
  testIdPrefix: string;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)]"
      data-testid={`${testIdPrefix}-sheet-backdrop`}
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-[18px] font-extrabold text-[var(--foreground)]">
          {title}
        </h2>
        <input
          aria-label={title}
          autoFocus
          className="mt-4 h-[38px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[14px] font-medium text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--brand)]"
          data-testid={`${testIdPrefix}-input`}
          maxLength={30}
          onChange={(event) => onInputChange(event.target.value)}
          type="text"
          value={inputValue}
        />
        <p className="mt-2 text-[12px] font-medium text-[var(--text-3)]">
          1~30자로 입력해 주세요
        </p>
        {errorMessage ? (
          <p className="mt-2 text-[12px] font-bold text-[var(--danger)]" data-testid={`${testIdPrefix}-sheet-error`}>
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-[78px_minmax(0,1fr)] gap-2">
          <button
            className="h-[var(--control-height-lg)] rounded-[var(--radius-control)] bg-[var(--surface-fill)] text-[16px] font-extrabold text-[var(--foreground)]"
            onClick={onClose}
            type="button"
          >
            취소
          </button>
          <button
            className="h-[var(--control-height-lg)] rounded-[var(--radius-control)] bg-[var(--brand)] text-[16px] font-extrabold text-[var(--text-inverse)] disabled:bg-[var(--line-strong)]"
            data-testid={`${testIdPrefix}-save`}
            disabled={saveDisabled}
            onClick={onSave}
            type="button"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileConfirmSheet({
  confirmLabel,
  description,
  destructive = false,
  disabled,
  errorMessage,
  extraWarning,
  idPrefix,
  onCancel,
  onConfirm,
  title,
}: {
  confirmLabel: string;
  description?: string;
  destructive?: boolean;
  disabled?: boolean;
  errorMessage?: string | null;
  extraWarning?: string;
  idPrefix: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-description`;

  useDialogBoundary({
    closeOnEscape: !disabled,
    dialogRef,
    initialFocusRef: cancelRef,
    onClose: onCancel,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)]">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2"
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--line-strong)]" />
        <h2 className="text-[18px] font-extrabold text-[var(--foreground)]" id={titleId}>
          {title}
        </h2>
        <div id={descriptionId}>
          {description ? (
            <p className="mt-3 text-[13px] font-medium leading-5 text-[var(--text-2)]">
              {description}
            </p>
          ) : null}
          {extraWarning ? (
            <p className="mt-4 rounded-[var(--radius-control)] bg-[var(--danger-soft)] px-3 py-2 text-[11px] font-bold leading-5 text-[var(--danger)]">
              {extraWarning}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="mt-3 text-[12px] font-bold text-[var(--danger)]" data-testid="dialog-error">
              {errorMessage}
            </p>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="h-[var(--control-height-md)] rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[14px] font-extrabold text-[var(--text-2)]"
            disabled={disabled}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            취소
          </button>
          <button
            className={[
              "h-[var(--control-height-md)] rounded-[var(--radius-control)] text-[14px] font-extrabold text-[var(--text-inverse)] disabled:opacity-60",
              destructive ? "bg-[var(--danger)]" : "bg-[var(--brand)]",
            ].join(" ")}
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
