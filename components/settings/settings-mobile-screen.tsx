"use client";

import React from "react";

import { useAppReturn } from "@/components/shared/use-app-return";
import type { UserProfileData } from "@/lib/api/mypage";
import type { PlannerColumnData } from "@/types/planner";

export type SettingsMobileSurface = "settings" | "account";

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
  logoutError: string | null;
  isAddingColumn: boolean;
  isDeleting: boolean;
  isDeletingColumn: boolean;
  isLoggingOut: boolean;
  isRenamingColumn: boolean;
  isSavingNickname: boolean;
  nicknameError: string | null;
  nicknameInput: string;
  nicknameSaveDisabled: boolean;
  plannerColumns: PlannerColumnData[];
  profile: UserProfileData | null;
  renameTarget: PlannerColumnData | null;
  showColumnAddSheet: boolean;
  showDeleteDialog: boolean;
  showLogoutDialog: boolean;
  showNicknameSheet: boolean;
  surface: SettingsMobileSurface;
  onAddColumn: () => void;
  onCloseColumnAddSheet: () => void;
  onCloseDeleteColumnDialog: () => void;
  onCloseDeleteDialog: () => void;
  onCloseLogoutDialog: () => void;
  onCloseNicknameSheet: () => void;
  onCloseRenameColumnSheet: () => void;
  onColumnsEditModeChange: (editing: boolean) => void;
  onColumnAddInputChange: (value: string) => void;
  onColumnRenameInputChange: (value: string) => void;
  onConfirmDelete: () => void;
  onConfirmDeleteColumn: () => void;
  onConfirmLogout: () => void;
  onDeleteColumnTarget: (column: PlannerColumnData) => void;
  onOpenColumnAddSheet: () => void;
  onOpenDeleteDialog: () => void;
  onOpenLogoutDialog: () => void;
  onOpenNicknameSheet: () => void;
  onRenameColumn: () => void;
  onRenameColumnTarget: (column: PlannerColumnData) => void;
  onRetryColumns: () => void;
  onSaveNickname: () => void;
  onToggleWakeLock: () => void;
  onNicknameInputChange: (value: string) => void;
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
  logoutError,
  isAddingColumn,
  isDeleting,
  isDeletingColumn,
  isLoggingOut,
  isRenamingColumn,
  isSavingNickname,
  nicknameError,
  nicknameInput,
  nicknameSaveDisabled,
  plannerColumns,
  profile,
  renameTarget,
  showColumnAddSheet,
  showDeleteDialog,
  showLogoutDialog,
  showNicknameSheet,
  surface,
  onAddColumn,
  onCloseColumnAddSheet,
  onCloseDeleteColumnDialog,
  onCloseDeleteDialog,
  onCloseLogoutDialog,
  onCloseNicknameSheet,
  onCloseRenameColumnSheet,
  onColumnsEditModeChange,
  onColumnAddInputChange,
  onColumnRenameInputChange,
  onConfirmDelete,
  onConfirmDeleteColumn,
  onConfirmLogout,
  onDeleteColumnTarget,
  onOpenColumnAddSheet,
  onOpenDeleteDialog,
  onOpenLogoutDialog,
  onOpenNicknameSheet,
  onRenameColumn,
  onRenameColumnTarget,
  onRetryColumns,
  onSaveNickname,
  onToggleWakeLock,
  onNicknameInputChange,
}: SettingsMobileScreenProps) {
  const title = surface === "account" ? "계정 관리" : "설정";
  const appReturn = useAppReturn({ fallback: "/mypage" });

  return (
    <div className="min-h-dvh bg-[var(--surface-fill)] pb-[calc(24px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden">
      <MobileAppBar
        onBack={appReturn.goBack}
        title={title}
      />

      {errorMessage ? (
        <div
          className="mx-4 mt-2 rounded-[var(--radius-control)] bg-[var(--danger)] px-4 py-3 text-center text-[13px] font-extrabold text-[var(--text-inverse)]"
          data-testid="settings-error-toast"
          role="status"
        >
          {errorMessage}
        </div>
      ) : null}

      {surface === "settings" ? (
        <SettingsSurface
          columnAddInput={columnAddInput}
          columnsEditMode={columnsEditMode}
          columnsError={columnsError}
          columnsLoading={columnsLoading}
          plannerColumns={plannerColumns}
          profile={profile}
          onAddColumn={onAddColumn}
          onColumnAddInputChange={onColumnAddInputChange}
          onColumnsEditModeChange={onColumnsEditModeChange}
          onDeleteColumnTarget={onDeleteColumnTarget}
          onOpenColumnAddSheet={onOpenColumnAddSheet}
          onRenameColumnTarget={onRenameColumnTarget}
          onRetryColumns={onRetryColumns}
          onToggleWakeLock={onToggleWakeLock}
        />
      ) : (
        <AccountSurface
          profile={profile}
          onOpenNicknameSheet={onOpenNicknameSheet}
          onOpenDeleteDialog={onOpenDeleteDialog}
          onOpenLogoutDialog={onOpenLogoutDialog}
        />
      )}

      {showNicknameSheet ? (
        <MobileNicknameSheet
          errorMessage={nicknameError}
          isSaving={isSavingNickname}
          nicknameInput={nicknameInput}
          onClose={onCloseNicknameSheet}
          onInputChange={onNicknameInputChange}
          onSave={onSaveNickname}
          saveDisabled={nicknameSaveDisabled}
        />
      ) : null}

      {showLogoutDialog ? (
        <MobileConfirmSheet
          confirmLabel={isLoggingOut ? "로그아웃 중..." : "로그아웃"}
          description="다시 로그인해야 식단·팬트리가 동기화돼요."
          disabled={isLoggingOut}
          errorMessage={logoutError}
          onCancel={onCloseLogoutDialog}
          onConfirm={onConfirmLogout}
          title="로그아웃 할까요?"
        />
      ) : null}

      {showDeleteDialog ? (
        <MobileConfirmSheet
          confirmLabel={isDeleting ? "탈퇴 중..." : "탈퇴하기"}
          destructive
          description="레시피북, 식단, 장보기, 팬트리 기록이 영구 삭제됩니다. 직접 등록한 레시피는 작성자 정보 없이 남을 수 있어요."
          disabled={isDeleting}
          errorMessage={deleteError}
          extraWarning="삭제 후 같은 소셜 계정으로 다시 로그인해도 이전 개인 기록은 복구되지 않아요."
          onCancel={onCloseDeleteDialog}
          onConfirm={onConfirmDelete}
          title="정말 탈퇴하시겠어요?"
        />
      ) : null}

      {showColumnAddSheet ? (
        <MobileColumnNameSheet
          errorMessage={columnAddError}
          inputValue={columnAddInput}
          isSaving={isAddingColumn}
          onClose={onCloseColumnAddSheet}
          onInputChange={onColumnAddInputChange}
          onSave={onAddColumn}
          saveDisabled={columnAddSaveDisabled}
          testIdPrefix="add-column"
          title="끼니 컬럼 추가"
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
          confirmLabel={isDeletingColumn ? "삭제 중..." : "삭제하기"}
          destructive
          description={`"${deleteColumnTarget.name}" 컬럼을 삭제할까요?`}
          disabled={isDeletingColumn}
          errorMessage={deleteColumnError}
          onCancel={onCloseDeleteColumnDialog}
          onConfirm={onConfirmDeleteColumn}
          title="끼니 컬럼 삭제"
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
      <button
        aria-label="뒤로가기"
        className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start border-0 bg-transparent p-0 text-[var(--foreground)]"
        onClick={onBack}
        type="button"
      >
        <BackIcon />
      </button>
      <h1 className="truncate text-center text-[18px] font-extrabold leading-none text-[var(--foreground)]">
        {title}
      </h1>
    </div>
  );
}

function SettingsSurface({
  columnAddInput,
  columnsEditMode,
  columnsError,
  columnsLoading,
  plannerColumns,
  profile,
  onAddColumn,
  onColumnAddInputChange,
  onColumnsEditModeChange,
  onDeleteColumnTarget,
  onOpenColumnAddSheet,
  onRenameColumnTarget,
  onRetryColumns,
  onToggleWakeLock,
}: {
  columnAddInput: string;
  columnsEditMode: boolean;
  columnsError: string | null;
  columnsLoading: boolean;
  plannerColumns: PlannerColumnData[];
  profile: UserProfileData | null;
  onAddColumn: () => void;
  onColumnAddInputChange: (value: string) => void;
  onColumnsEditModeChange: (editing: boolean) => void;
  onDeleteColumnTarget: (column: PlannerColumnData) => void;
  onOpenColumnAddSheet: () => void;
  onRenameColumnTarget: (column: PlannerColumnData) => void;
  onRetryColumns: () => void;
  onToggleWakeLock: () => void;
}) {
  return (
    <main className="pb-4">
      <section className="border-b border-[var(--surface-subtle)] bg-[var(--surface)] px-4 pb-2 pt-5">
        <h2 className="mb-2.5 text-[16px] font-extrabold text-[var(--foreground)]">
          요리 모드
        </h2>
        <div className="divide-y divide-[var(--surface-subtle)]">
          <SettingToggleRow
            checked={profile?.settings.screen_wake_lock ?? false}
            description="요리 중 화면이 꺼지지 않아요"
            label="화면 켜둠"
            onClick={onToggleWakeLock}
          />
          <SettingToggleRow
            checked={false}
            description="단계 음성을 읽어줘요 (베타)"
            disabled
            label="음성 안내"
          />
          <SettingToggleRow
            checked={false}
            disabled
            label="타이머 끝나면 다음 단계 자동"
          />
        </div>
      </section>

      <section
        className="px-4 pt-4"
        data-testid="column-management-section"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold text-[var(--foreground)]">
            플래너 끼니 컬럼
          </h2>
          {!columnsLoading && !columnsError ? (
            <button
              className="h-8 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[12px] font-bold text-[var(--text-2)]"
              onClick={() => onColumnsEditModeChange(!columnsEditMode)}
              type="button"
            >
              {columnsEditMode ? "완료" : "편집"}
            </button>
          ) : null}
        </div>

        {columnsLoading ? (
          <div
            className="space-y-2"
            data-testid="columns-loading"
          >
            {[1, 2, 3].map((index) => (
              <div
                className="h-[38px] rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)]"
                key={index}
              />
            ))}
          </div>
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
            <div className="space-y-[10px]" data-testid="column-list">
              {plannerColumns.map((column) => (
                <div
                  className={
                    columnsEditMode
                      ? "grid grid-cols-[minmax(0,1fr)_38px] gap-2"
                      : "grid grid-cols-1"
                  }
                  data-testid={`column-item-${column.id}`}
                  key={column.id}
                >
                  <button
                    className="h-[38px] truncate rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-left text-[14px] font-medium text-[var(--foreground)]"
                    data-testid={`rename-column-${column.id}`}
                    onClick={() => onRenameColumnTarget(column)}
                    type="button"
                  >
                    {column.name}
                  </button>
                  {columnsEditMode ? (
                    <button
                      aria-label={`${column.name} 삭제`}
                      className="flex h-[38px] items-center justify-center rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--surface)] text-[16px] font-bold text-[var(--danger)] disabled:border-[var(--line-strong)] disabled:text-[var(--text-4)]"
                      data-testid={`delete-column-${column.id}`}
                      disabled={plannerColumns.length <= 1}
                      onClick={() => onDeleteColumnTarget(column)}
                      type="button"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 min-[390px]:grid-cols-[minmax(0,1fr)_132px]">
              <input
                aria-label="새 끼니 이름"
                className="h-[38px] min-w-0 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[14px] font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-[var(--brand)]"
                maxLength={30}
                onChange={(event) => onColumnAddInputChange(event.target.value)}
                placeholder="새 끼니 이름"
                type="text"
                value={columnAddInput}
              />
              <button
                className="h-[38px] whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--brand)] px-3 text-[12px] font-bold text-[var(--text-inverse)] disabled:bg-[var(--line-strong)]"
                data-testid="add-column-button"
                disabled={plannerColumns.length >= 5}
                onClick={() => {
                  if (columnAddInput.trim()) {
                    onAddColumn();
                    return;
                  }
                  onOpenColumnAddSheet();
                }}
                type="button"
              >
                {plannerColumns.length >= 5 ? "최대 5개" : "+ 끼니 컬럼 추가"}
              </button>
            </div>

            <p className="mt-2 text-[12px] font-medium text-[var(--text-3)]">
              최소 2개, 최대 5개의 끼니를 등록할 수 있어요. 현재{" "}
              {plannerColumns.length}/5개
            </p>
          </>
        )}
      </section>

      <div className="mt-2 grid grid-cols-[78px_minmax(0,1fr)] gap-2 border-t border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3">
        <button
          className="h-[var(--control-height-lg)] rounded-[var(--radius-control)] bg-[var(--line-strong)] text-[16px] font-extrabold text-[var(--text-4)]"
          disabled
          type="button"
        >
          취소
        </button>
        <button
          className="h-[var(--control-height-lg)] rounded-[var(--radius-control)] bg-[var(--line-strong)] text-[16px] font-extrabold text-[var(--text-4)]"
          disabled
          type="button"
        >
          저장
        </button>
      </div>
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

function AccountSurface({
  profile,
  onOpenNicknameSheet,
  onOpenDeleteDialog,
  onOpenLogoutDialog,
}: {
  profile: UserProfileData | null;
  onOpenNicknameSheet: () => void;
  onOpenDeleteDialog: () => void;
  onOpenLogoutDialog: () => void;
}) {
  const fields = [
    ["닉네임", profile?.nickname ?? "집밥러버"],
    ["이메일", profile?.email ?? "이메일 없음"],
    ["로그인 방식", formatProviderLabel(profile?.social_provider)],
  ];

  return (
    <main className="px-4 py-4">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]">
        {fields.map(([label, value], index) => (
          <div
            className={[
              "flex min-h-[var(--control-height-lg)] w-full items-center px-4 text-left",
              index < fields.length - 1 ? "border-b border-[var(--surface-subtle)]" : "",
            ].join(" ")}
            key={label}
          >
            <span
              className="shrink-0 text-[13px] font-bold text-[var(--text-3)]"
              style={{ width: "clamp(92px, 26vw, 100px)" }}
            >
              {label}
            </span>
            <span
              className="min-w-0 flex-1 truncate font-semibold text-[var(--foreground)]"
              style={{ fontSize: "clamp(13px, 3.6vw, 14px)" }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        <button
          className="h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] bg-[var(--brand)] text-[15px] font-bold text-[var(--text-inverse)]"
          data-testid="nickname-row"
          onClick={onOpenNicknameSheet}
          type="button"
        >
          닉네임 변경
        </button>
        <button
          className="h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[15px] font-bold text-[var(--foreground)]"
          onClick={onOpenLogoutDialog}
          type="button"
        >
          로그아웃
        </button>
        <button
          className="h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] bg-transparent text-[14px] font-bold text-[var(--danger)]"
          onClick={onOpenDeleteDialog}
          type="button"
        >
          회원탈퇴
        </button>
      </div>
    </main>
  );
}

function MobileNicknameSheet({
  errorMessage,
  isSaving,
  nicknameInput,
  onClose,
  onInputChange,
  onSave,
  saveDisabled,
}: {
  errorMessage: string | null;
  isSaving: boolean;
  nicknameInput: string;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onSave: () => void;
  saveDisabled: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)]"
      data-testid="nickname-sheet-backdrop"
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-[18px] font-extrabold text-[var(--foreground)]">
          닉네임 변경
        </h2>
        <input
          className="mt-4 h-[38px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[14px] font-medium text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--brand)]"
          maxLength={12}
          onChange={(event) => onInputChange(event.target.value)}
          type="text"
          value={nicknameInput}
        />
        <p className="mt-2 text-[12px] font-medium text-[var(--text-3)]">
          {nicknameInput.length}/12자
        </p>
        {errorMessage ? (
          <p className="mt-2 text-[12px] font-bold text-[var(--danger)]" data-testid="nickname-error">
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
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)]">
      <div
        aria-modal="true"
        className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2"
        role="alertdialog"
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--line-strong)]" />
        <h2 className="text-[18px] font-extrabold text-[var(--foreground)]">
          {title}
        </h2>
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
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="h-[var(--control-height-md)] rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[14px] font-extrabold text-[var(--text-2)]"
            disabled={disabled}
            onClick={onCancel}
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

function BackIcon() {
  return (
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
  );
}
