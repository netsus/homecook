// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  QA_FIXTURE_FAULTS_HEADER,
  QA_FIXTURE_FAULTS_KEY,
  readQaFixtureFaultsHeader,
  withQaFixtureOverrideHeaders,
} from "@/lib/mock/qa-fixture-overrides";
import {
  E2E_AUTH_OVERRIDE_COOKIE,
  E2E_AUTH_OVERRIDE_HEADER,
  E2E_AUTH_OVERRIDE_KEY,
  persistE2EAuthOverrideState,
  readE2EAuthOverride,
  readE2EAuthOverrideCookie,
} from "@/lib/auth/e2e-auth-override";

function createMemoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe("qa fixture override headers", () => {
  const originalQaFixtureFlag = process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES;

  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: createMemoryStorage(),
      },
      configurable: true,
    });
    window.localStorage.clear();
    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES = "1";
  });

  afterEach(() => {
    if (originalQaFixtureFlag === undefined) {
      delete process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES;
      return;
    }

    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES = originalQaFixtureFlag;
  });

  it("parses valid fault overrides from request headers", () => {
    const headers = new Headers({
      [QA_FIXTURE_FAULTS_HEADER]: JSON.stringify({
        recipe_books_list: "internal_error",
        recipe_save: "duplicate_save",
      }),
    });

    expect(readQaFixtureFaultsHeader(headers)).toEqual({
      recipe_books_list: "internal_error",
      recipe_save: "duplicate_save",
    });
  });

  it("ignores malformed fault override headers", () => {
    const headers = new Headers({
      [QA_FIXTURE_FAULTS_HEADER]: "{",
    });

    expect(readQaFixtureFaultsHeader(headers)).toBeNull();
  });

  it("applies auth and fault overrides from localStorage to request headers", () => {
    window.localStorage.setItem(E2E_AUTH_OVERRIDE_KEY, "authenticated");
    window.localStorage.setItem(QA_FIXTURE_FAULTS_KEY, JSON.stringify({
      recipe_save: "forbidden_book",
    }));

    const init = withQaFixtureOverrideHeaders({
      headers: {
        "Content-Type": "application/json",
      },
    });
    const headers = new Headers(init.headers);

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get(E2E_AUTH_OVERRIDE_HEADER)).toBe("authenticated");
    expect(headers.get(QA_FIXTURE_FAULTS_HEADER)).toBe(
      JSON.stringify({
        recipe_save: "forbidden_book",
      }),
    );
  });

  it("persists auth override to both localStorage and cookie", () => {
    persistE2EAuthOverrideState("authenticated");

    expect(window.localStorage.getItem(E2E_AUTH_OVERRIDE_KEY)).toBe("authenticated");
    expect(document.cookie).toContain(`${E2E_AUTH_OVERRIDE_COOKIE}=authenticated`);
  });

  it("reads server-side auth override from cookies when QA fixture mode is enabled", () => {
    expect(
      readE2EAuthOverrideCookie({
        get(name: string) {
          if (name !== E2E_AUTH_OVERRIDE_COOKIE) {
            return undefined;
          }

          return { value: "authenticated" };
        },
      }),
    ).toBe("authenticated");
  });

  it("ignores local QA overrides when client fixture mode is disabled", () => {
    delete process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES;
    window.localStorage.setItem(E2E_AUTH_OVERRIDE_KEY, "authenticated");
    window.localStorage.setItem(QA_FIXTURE_FAULTS_KEY, JSON.stringify({
      recipe_books_list: "internal_error",
    }));

    const init = withQaFixtureOverrideHeaders();
    const headers = new Headers(init.headers);

    expect(readE2EAuthOverride()).toBeNull();
    expect(
      readE2EAuthOverrideCookie({
        get() {
          return { value: "authenticated" };
        },
      }),
    ).toBeNull();
    expect(headers.get(E2E_AUTH_OVERRIDE_HEADER)).toBeNull();
    expect(headers.get(QA_FIXTURE_FAULTS_HEADER)).toBeNull();
  });
});
