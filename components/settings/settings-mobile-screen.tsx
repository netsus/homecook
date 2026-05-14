"use client";

import { useRouter } from "next/navigation";
import React from "react";

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
  const title = surface === "account" ? "계정 정보" : "설정";
  const router = useRouter();

  return (
    <div
      className="min-h-dvh bg-[#F8F9FA] pb-[calc(24px+env(safe-area-inset-bottom))] text-[#212529] lg:hidden"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif',
      }}
    >
      <MobileAppBar
        onBack={() => router.push("/mypage")}
        title={title}
      />

      {errorMessage ? (
        <div
          className="mx-4 mt-2 rounded-lg bg-[#FF6B6B] px-4 py-3 text-center text-[13px] font-extrabold text-white"
          data-testid="settings-error-toast"
          role="status"
        >
          {errorMessage}
        </div>
      ) : null}

      {surface === "settings" ? (
        <SettingsSurface
          columnAddInput={columnAddInput}
          columnsError={columnsError}
          columnsLoading={columnsLoading}
          plannerColumns={plannerColumns}
          profile={profile}
          onAddColumn={onAddColumn}
          onColumnAddInputChange={onColumnAddInputChange}
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
          description="모든 식단, 레시피, 팬트리 기록이 영구 삭제됩니다. 이 동작은 되돌릴 수 없어요."
          disabled={isDeleting}
          errorMessage={deleteError}
          extraWarning="△ 7일 이내 재로그인 시 일부 데이터는 복구가 가능합니다 (베타)."
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
      className="sticky top-0 z-30 flex min-h-[52px] items-center justify-center border-b border-[#DEE2E6] bg-white px-4"
      style={{ borderBottomWidth: "0.5px" }}
    >
      <button
        aria-label="뒤로가기"
        className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start border-0 bg-transparent p-0 text-[#212529]"
        onClick={onBack}
        type="button"
      >
        <BackIcon />
      </button>
      <h1 className="truncate text-center text-[18px] font-extrabold leading-none text-[#212529]">
        {title}
      </h1>
    </div>
  );
}

function SettingsSurface({
  columnAddInput,
  columnsError,
  columnsLoading,
  plannerColumns,
  profile,
  onAddColumn,
  onColumnAddInputChange,
  onDeleteColumnTarget,
  onOpenColumnAddSheet,
  onRenameColumnTarget,
  onRetryColumns,
  onToggleWakeLock,
}: {
  columnAddInput: string;
  columnsError: string | null;
  columnsLoading: boolean;
  plannerColumns: PlannerColumnData[];
  profile: UserProfileData | null;
  onAddColumn: () => void;
  onColumnAddInputChange: (value: string) => void;
  onDeleteColumnTarget: (column: PlannerColumnData) => void;
  onOpenColumnAddSheet: () => void;
  onRenameColumnTarget: (column: PlannerColumnData) => void;
  onRetryColumns: () => void;
  onToggleWakeLock: () => void;
}) {
  return (
    <main className="pb-4">
      <section className="border-b border-[#F1F3F5] bg-white px-4 pb-2 pt-5">
        <h2 className="mb-2.5 text-[16px] font-extrabold text-[#212529]">
          요리 모드
        </h2>
        <div className="divide-y divide-[#F1F3F5]">
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
        <h2 className="mb-2 text-[16px] font-extrabold text-[#212529]">
          플래너 끼니 컬럼
        </h2>

        {columnsLoading ? (
          <div
            className="space-y-2"
            data-testid="columns-loading"
          >
            {[1, 2, 3].map((index) => (
              <div
                className="h-[38px] rounded-lg border border-[#DEE2E6] bg-white"
                key={index}
              />
            ))}
          </div>
        ) : columnsError ? (
          <div
            className="rounded-xl border border-[#DEE2E6] bg-white p-4"
            data-testid="columns-error"
          >
            <p className="text-[13px] font-bold text-[#FF6B6B]">
              {columnsError}
            </p>
            <button
              className="mt-3 h-10 rounded-lg bg-[#2AC1BC] px-4 text-[13px] font-extrabold text-white"
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
                  className="grid grid-cols-[minmax(0,1fr)_38px] gap-2"
                  data-testid={`column-item-${column.id}`}
                  key={column.id}
                >
                  <button
                    className="h-[38px] truncate rounded-lg border border-[#DEE2E6] bg-white px-3 text-left text-[14px] font-medium text-[#212529]"
                    data-testid={`rename-column-${column.id}`}
                    onClick={() => onRenameColumnTarget(column)}
                    type="button"
                  >
                    {column.name}
                  </button>
                  <button
                    aria-label={`${column.name} 삭제`}
                    className="flex h-[38px] items-center justify-center rounded-xl border border-[#DEE2E6] bg-white text-[18px] font-extrabold text-[#FF6B6B] disabled:text-[#ADB5BD]"
                    data-testid={`delete-column-${column.id}`}
                    disabled={plannerColumns.length <= 1}
                    onClick={() => onDeleteColumnTarget(column)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_102px] gap-2">
              <input
                aria-label="새 끼니 이름"
                className="h-[38px] min-w-0 rounded-lg border border-[#DEE2E6] bg-white px-3 text-[14px] font-medium text-[#212529] outline-none placeholder:text-[#868E96] focus:ring-2 focus:ring-[#2AC1BC]"
                maxLength={30}
                onChange={(event) => onColumnAddInputChange(event.target.value)}
                placeholder="새 끼니 이름"
                type="text"
                value={columnAddInput}
              />
              <button
                className="h-[38px] whitespace-nowrap rounded-xl bg-[#2AC1BC] text-[10.5px] font-bold text-white disabled:bg-[#DEE2E6]"
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

            <p className="mt-2 text-[12px] font-medium text-[#868E96]">
              {plannerColumns.length}/5개
            </p>
          </>
        )}
      </section>

      <div className="mt-2 grid grid-cols-[78px_minmax(0,1fr)] gap-2 border-t border-[#DEE2E6] bg-white px-4 py-3">
        <button
          className="h-12 rounded-lg bg-[#DEE2E6] text-[16px] font-extrabold text-[#ADB5BD]"
          disabled
          type="button"
        >
          취소
        </button>
        <button
          className="h-12 rounded-lg bg-[#DEE2E6] text-[16px] font-extrabold text-[#ADB5BD]"
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
        <p className="text-[15px] font-extrabold leading-[1.3] text-[#212529]">
          {label}
        </p>
        {description ? (
          <p className="mt-0.5 text-[12px] font-medium leading-[1.35] text-[#868E96]">
            {description}
          </p>
        ) : null}
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        className={[
          "relative h-7 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-[#2AC1BC]" : "bg-[#DEE2E6]",
        ].join(" ")}
        disabled={disabled}
        onClick={onClick}
        role="switch"
        type="button"
      >
        <span
          className={[
            "absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.20)] transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
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
    ["이름", profile?.nickname ?? "집밥러버"],
    ["이메일", profile?.email ?? "user@homecook.app"],
    ["전화번호", "010-1234-5678"],
    ["생일", "1995-04-12"],
    ["요리 레벨", "레벨 5 · 집밥 러너"],
    ["가입일", "2025년 11월 3일"],
  ];

  return (
    <main className="px-4 py-4">
      <div className="overflow-hidden rounded-xl border border-[#DEE2E6] bg-white">
        {fields.map(([label, value], index) => (
          <button
            className={[
              "flex min-h-[49px] w-full items-center px-4 text-left",
              index < fields.length - 1 ? "border-b border-[#F1F3F5]" : "",
            ].join(" ")}
            key={label}
            type="button"
          >
            <span
              className="shrink-0 text-[13px] font-bold text-[#868E96]"
              style={{ width: "clamp(92px, 26vw, 100px)" }}
            >
              {label}
            </span>
            <span
              className="min-w-0 flex-1 truncate font-extrabold text-[#212529]"
              style={{ fontSize: "clamp(13px, 3.6vw, 14px)" }}
            >
              {value}
            </span>
            <ChevronRightIcon />
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-5">
        <button
          className="h-12 w-full rounded-lg bg-[#2AC1BC] text-[16px] font-extrabold text-white"
          data-testid="nickname-row"
          onClick={onOpenNicknameSheet}
          type="button"
        >
          닉네임 변경
        </button>
        <button
          className="h-12 w-full rounded-lg bg-transparent text-[16px] font-extrabold text-[#212529]"
          type="button"
        >
          비밀번호 변경
        </button>
        <button
          className="h-12 w-full rounded-lg bg-transparent text-[16px] font-extrabold text-[#212529]"
          onClick={onOpenLogoutDialog}
          type="button"
        >
          로그아웃
        </button>
        <button
          className="h-12 w-full rounded-lg bg-[#FF6B6B] text-[16px] font-extrabold text-white"
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      data-testid="nickname-sheet-backdrop"
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="w-full rounded-t-[20px] bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-[18px] font-extrabold text-[#212529]">
          닉네임 변경
        </h2>
        <input
          className="mt-4 h-[38px] w-full rounded-md border border-[#DEE2E6] bg-white px-3 text-[14px] font-medium text-[#212529] outline-none focus:ring-2 focus:ring-[#2AC1BC]"
          maxLength={12}
          onChange={(event) => onInputChange(event.target.value)}
          type="text"
          value={nicknameInput}
        />
        <p className="mt-2 text-[12px] font-medium text-[#868E96]">
          {nicknameInput.length}/12자
        </p>
        {errorMessage ? (
          <p className="mt-2 text-[12px] font-bold text-[#FF6B6B]" data-testid="nickname-error">
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-[78px_minmax(0,1fr)] gap-2">
          <button
            className="h-12 rounded-lg bg-[#F8F9FA] text-[16px] font-extrabold text-[#212529]"
            onClick={onClose}
            type="button"
          >
            취소
          </button>
          <button
            className="h-12 rounded-lg bg-[#2AC1BC] text-[16px] font-extrabold text-white disabled:bg-[#DEE2E6]"
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      data-testid={`${testIdPrefix}-sheet-backdrop`}
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="w-full rounded-t-[20px] bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-[18px] font-extrabold text-[#212529]">
          {title}
        </h2>
        <input
          aria-label={title}
          autoFocus
          className="mt-4 h-[38px] w-full rounded-md border border-[#DEE2E6] bg-white px-3 text-[14px] font-medium text-[#212529] outline-none focus:ring-2 focus:ring-[#2AC1BC]"
          data-testid={`${testIdPrefix}-input`}
          maxLength={30}
          onChange={(event) => onInputChange(event.target.value)}
          type="text"
          value={inputValue}
        />
        <p className="mt-2 text-[12px] font-medium text-[#868E96]">
          1~30자로 입력해 주세요
        </p>
        {errorMessage ? (
          <p className="mt-2 text-[12px] font-bold text-[#FF6B6B]" data-testid={`${testIdPrefix}-sheet-error`}>
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-[78px_minmax(0,1fr)] gap-2">
          <button
            className="h-12 rounded-lg bg-[#F8F9FA] text-[16px] font-extrabold text-[#212529]"
            onClick={onClose}
            type="button"
          >
            취소
          </button>
          <button
            className="h-12 rounded-lg bg-[#2AC1BC] text-[16px] font-extrabold text-white disabled:bg-[#DEE2E6]"
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div
        aria-modal="true"
        className="w-full rounded-t-[20px] bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2"
        role="alertdialog"
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[#DEE2E6]" />
        <h2 className="text-[18px] font-extrabold text-[#212529]">
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-[13px] font-medium leading-5 text-[#495057]">
            {description}
          </p>
        ) : null}
        {extraWarning ? (
          <p className="mt-4 rounded-lg bg-[#FFF5F5] px-3 py-2 text-[11px] font-bold leading-5 text-[#FF6B6B]">
            {extraWarning}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 text-[12px] font-bold text-[#FF6B6B]" data-testid="dialog-error">
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="h-11 rounded-lg border border-[#DEE2E6] bg-white text-[14px] font-extrabold text-[#495057]"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className={[
              "h-11 rounded-lg text-[14px] font-extrabold text-white disabled:opacity-60",
              destructive ? "bg-[#FF6B6B]" : "bg-[#2AC1BC]",
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

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-[#868E96]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
