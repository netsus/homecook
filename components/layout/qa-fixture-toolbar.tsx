"use client";

import React, { useEffect, useState } from "react";

import {
  E2E_AUTH_OVERRIDE_KEY,
  type E2EAuthOverrideState,
  persistE2EAuthOverrideState,
} from "@/lib/auth/e2e-auth-override";
import { isQaFixtureClientModeEnabled } from "@/lib/mock/qa-fixture-client";
import { QA_FIXTURE_FAULTS_KEY } from "@/lib/mock/qa-fixture-overrides";

const FAULT_OPTIONS = [
  {
    value: "none",
    label: "없음",
    storageValue: null,
  },
  {
    value: "recipe_books_list:internal_error",
    label: "레시피북 목록 500",
    storageValue: { recipe_books_list: "internal_error" },
  },
  {
    value: "recipe_books_create:internal_error",
    label: "레시피북 생성 500",
    storageValue: { recipe_books_create: "internal_error" },
  },
  {
    value: "recipe_save:missing_recipe",
    label: "저장 404 레시피 없음",
    storageValue: { recipe_save: "missing_recipe" },
  },
  {
    value: "recipe_save:missing_book",
    label: "저장 404 책 없음",
    storageValue: { recipe_save: "missing_book" },
  },
  {
    value: "recipe_save:forbidden_book",
    label: "저장 403 다른 사용자 책",
    storageValue: { recipe_save: "forbidden_book" },
  },
  {
    value: "recipe_save:invalid_book_type",
    label: "저장 409 저장 불가 타입",
    storageValue: { recipe_save: "invalid_book_type" },
  },
  {
    value: "recipe_save:duplicate_save",
    label: "저장 409 중복 저장",
    storageValue: { recipe_save: "duplicate_save" },
  },
  {
    value: "recipe_save:internal_error",
    label: "저장 500 서버 오류",
    storageValue: { recipe_save: "internal_error" },
  },
] as const;

function readAuthOverride() {
  if (typeof window === "undefined") {
    return "guest";
  }

  const value = window.localStorage.getItem(E2E_AUTH_OVERRIDE_KEY);

  return value === "authenticated" ? "authenticated" : "guest";
}

function readFaultSelection() {
  if (typeof window === "undefined") {
    return "none";
  }

  const raw = window.localStorage.getItem(QA_FIXTURE_FAULTS_KEY);

  if (!raw) {
    return "none";
  }

  return (
    FAULT_OPTIONS.find((option) => {
      if (!option.storageValue) {
        return false;
      }

      return raw === JSON.stringify(option.storageValue);
    })?.value ?? "none"
  );
}

function writeFaultSelection(nextValue: string) {
  if (typeof window === "undefined") {
    return;
  }

  const nextOption = FAULT_OPTIONS.find((option) => option.value === nextValue);

  if (!nextOption || !nextOption.storageValue) {
    window.localStorage.removeItem(QA_FIXTURE_FAULTS_KEY);
    return;
  }

  window.localStorage.setItem(
    QA_FIXTURE_FAULTS_KEY,
    JSON.stringify(nextOption.storageValue),
  );
}

export function QaFixtureToolbar() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [authState, setAuthState] = useState<E2EAuthOverrideState>("guest");
  const [faultState, setFaultState] = useState("none");

  useEffect(() => {
    setIsHydrated(true);

    if (!isQaFixtureClientModeEnabled()) {
      return;
    }

    if (window.navigator.webdriver) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    setAuthState(readAuthOverride());
    setFaultState(readFaultSelection());
  }, []);

  if (!isHydrated || !isQaFixtureClientModeEnabled() || !isVisible) {
    return null;
  }

  return (
    <aside className="fixed right-4 bottom-4 z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-[20px] border border-[var(--line)] bg-[rgba(255,250,244,0.96)] p-4 shadow-[0_18px_50px_rgba(60,43,24,0.16)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
            QA Fixture Mode
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
            로컬에서 slice를 바로 검증하는 전용 상태예요.
          </p>
        </div>
        <button
          className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--muted)]"
          onClick={() => window.location.reload()}
          type="button"
        >
          새로고침
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-[var(--foreground)]">
            QA 로그인 상태
          </span>
          <select
            aria-label="QA 로그인 상태"
            className="mt-1 min-h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-sm text-[var(--foreground)]"
            onChange={(event) => {
              const nextValue = event.target.value as E2EAuthOverrideState;
              persistE2EAuthOverrideState(nextValue);
              setAuthState(nextValue);
            }}
            value={authState}
          >
            <option value="guest">guest</option>
            <option value="authenticated">authenticated</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-[var(--foreground)]">
            QA fault
          </span>
          <select
            aria-label="QA fault"
            className="mt-1 min-h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 text-sm text-[var(--foreground)]"
            onChange={(event) => {
              const nextValue = event.target.value;
              writeFaultSelection(nextValue);
              setFaultState(nextValue);
            }}
            value={faultState}
          >
            {FAULT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
        로그인 상태 변경은 새로고침 후 바로 반영되고, fault는 다음 API 호출부터 적용됩니다.
      </p>

      <button
        className="mt-3 min-h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--foreground)]"
        onClick={() => {
          persistE2EAuthOverrideState(null);
          window.localStorage.removeItem(QA_FIXTURE_FAULTS_KEY);
          setAuthState("guest");
          setFaultState("none");
          window.location.reload();
        }}
        type="button"
      >
        QA 상태 초기화
      </button>
    </aside>
  );
}
