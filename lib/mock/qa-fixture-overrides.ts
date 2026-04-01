import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import { isQaFixtureClientModeEnabled } from "@/lib/mock/qa-fixture-client";

export const QA_FIXTURE_FAULTS_KEY = "homecook.qa-fixture-faults";
export const QA_FIXTURE_FAULTS_HEADER = "x-homecook-qa-fixture-faults";

const RECIPE_BOOK_LIST_FAULTS = new Set(["internal_error"]);
const RECIPE_BOOK_CREATE_FAULTS = new Set(["internal_error"]);
const RECIPE_SAVE_FAULTS = new Set([
  "missing_recipe",
  "missing_book",
  "forbidden_book",
  "invalid_book_type",
  "duplicate_save",
  "internal_error",
]);

export interface QaFixtureFaultOverrides {
  recipe_books_list?: "internal_error";
  recipe_books_create?: "internal_error";
  recipe_save?:
    | "missing_recipe"
    | "missing_book"
    | "forbidden_book"
    | "invalid_book_type"
    | "duplicate_save"
    | "internal_error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeQaFixtureFaultOverrides(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const normalized: QaFixtureFaultOverrides = {};

  if (typeof value.recipe_books_list === "string" && RECIPE_BOOK_LIST_FAULTS.has(value.recipe_books_list)) {
    normalized.recipe_books_list = value.recipe_books_list as QaFixtureFaultOverrides["recipe_books_list"];
  }

  if (typeof value.recipe_books_create === "string" && RECIPE_BOOK_CREATE_FAULTS.has(value.recipe_books_create)) {
    normalized.recipe_books_create = value.recipe_books_create as QaFixtureFaultOverrides["recipe_books_create"];
  }

  if (typeof value.recipe_save === "string" && RECIPE_SAVE_FAULTS.has(value.recipe_save)) {
    normalized.recipe_save = value.recipe_save as QaFixtureFaultOverrides["recipe_save"];
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function parseQaFixtureFaultOverrides(raw: string | null | undefined) {
  if (!raw) {
    return null;
  }

  try {
    return normalizeQaFixtureFaultOverrides(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readQaFixtureFaultOverridesState() {
  if (typeof window === "undefined" || !isQaFixtureClientModeEnabled()) {
    return null;
  }

  return parseQaFixtureFaultOverrides(window.localStorage.getItem(QA_FIXTURE_FAULTS_KEY));
}

export function readQaFixtureFaultsHeader(headers: Headers) {
  return parseQaFixtureFaultOverrides(headers.get(QA_FIXTURE_FAULTS_HEADER));
}

export function withQaFixtureOverrideHeaders(init?: RequestInit): RequestInit {
  const requestInit = withE2EAuthOverrideHeaders(init);

  if (!isQaFixtureClientModeEnabled()) {
    return requestInit;
  }

  const headers = new Headers(requestInit.headers);
  const faultOverrides = readQaFixtureFaultOverridesState();

  if (faultOverrides) {
    headers.set(QA_FIXTURE_FAULTS_HEADER, JSON.stringify(faultOverrides));
  }

  return {
    ...requestInit,
    headers,
  };
}
