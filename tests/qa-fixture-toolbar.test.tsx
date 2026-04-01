// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QaFixtureToolbar } from "@/components/layout/qa-fixture-toolbar";
import { E2E_AUTH_OVERRIDE_KEY } from "@/lib/auth/e2e-auth-override";
import { QA_FIXTURE_FAULTS_KEY } from "@/lib/mock/qa-fixture-overrides";

describe("qa fixture toolbar", () => {
  const originalQaFixtureFlag = process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES;
  const reload = vi.fn();

  beforeEach(() => {
    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES = "1";
    window.localStorage.clear();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        reload,
      },
    });
    reload.mockReset();
  });

  afterEach(() => {
    cleanup();

    if (originalQaFixtureFlag === undefined) {
      delete process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES;
    } else {
      process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES = originalQaFixtureFlag;
    }
  });

  it("does not render outside QA fixture mode", () => {
    delete process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES;

    render(<QaFixtureToolbar />);

    expect(screen.queryByText("QA Fixture Mode")).toBeNull();
  });

  it("shows current local QA controls and updates auth state", async () => {
    const user = userEvent.setup();

    window.localStorage.setItem(E2E_AUTH_OVERRIDE_KEY, "guest");

    render(<QaFixtureToolbar />);

    expect(await screen.findByText("QA Fixture Mode")).toBeTruthy();
    expect(
      (screen.getByLabelText("QA 로그인 상태") as HTMLSelectElement).value,
    ).toBe("guest");

    await user.selectOptions(screen.getByLabelText("QA 로그인 상태"), "authenticated");

    expect(window.localStorage.getItem(E2E_AUTH_OVERRIDE_KEY)).toBe("authenticated");
  });

  it("clears QA overrides and reloads the page on reset", async () => {
    const user = userEvent.setup();

    window.localStorage.setItem(E2E_AUTH_OVERRIDE_KEY, "authenticated");
    window.localStorage.setItem(QA_FIXTURE_FAULTS_KEY, JSON.stringify({
      recipe_books_list: "internal_error",
    }));

    render(<QaFixtureToolbar />);

    await screen.findByText("QA Fixture Mode");
    await user.click(screen.getByRole("button", { name: "QA 상태 초기화" }));

    expect(window.localStorage.getItem(E2E_AUTH_OVERRIDE_KEY)).toBeNull();
    expect(window.localStorage.getItem(QA_FIXTURE_FAULTS_KEY)).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
