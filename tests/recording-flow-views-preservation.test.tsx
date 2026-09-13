// @vitest-environment jsdom
import React from "react";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MarketingDemandValidationScreen } from "@/components/marketing/marketing-demand-validation-screen";

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/marketing-validation", () => ({ postMarketingValidation: post }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("preserves the full legacy result-to-done markup and original action order", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-12T03:00:00Z"));
  window.history.replaceState({}, "", "/beta"); window.sessionStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  post.mockReset(); post.mockImplementation(async (body: { action: string }) => ({ success: true, data: { state: body.action, stage: body.action, ...(body.action === "quiz_completed" ? { quiz_result: "ingredient-tracker", target_qualified: null } : {}) }, error: null }));
  const user = userEvent.setup();
  const { container } = render(<MarketingDemandValidationScreen getTurnstileToken={async () => ({ ok: true, token: "fixture-token" })} />);
  async function click(name: string) { const button = await screen.findByRole("button", { name }); await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); await user.click(button); }
  async function capture(stage: string) {
    await waitFor(() => expect(container.querySelector("main")?.getAttribute("data-stage")).toBe(stage));
    expect(container.querySelector("main")?.outerHTML).toMatchSnapshot(stage);
  }
  await click("내 집밥기록 유형 알아보기");
  for (const answer of ["거의 매일", "3~5끼", "딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록", "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것"]) await click(answer);
  await capture("result");
  await click("무먹으로 20초 체험하기"); await capture("experience-1");
  await click("무먹으로 가져오기"); await click("다음"); await capture("experience-2");
  await click("돼지고기 600g → 520g"); await click("다음"); await capture("experience-3");
  fireEvent.load(screen.getByAltText("완성된 제육볶음이 올라간 디지털 주방저울"));
  await click("저울로 재보니 1,180g"); await click("다음"); await capture("experience-4");
  await click("320g 입력하기"); await capture("experience-5"); await click("식단에 기록하기");
  await waitFor(() => expect(container.querySelector('[data-stage="planner-homecook"] [data-highlight="meal"]')).not.toBeNull());
  await capture("planner-homecook");
  await click("편의점 음식도 기록해보기"); await capture("packaged-food");
  await click("+ 기록하기");
  await waitFor(() => expect(container.querySelector('[data-stage="planner-complete"] [data-highlight="product"]')).not.toBeNull());
  await capture("planner-complete");
  await click("무료 베타 먼저 써보기"); await capture("beta-form");
  await click("무료 베타 초대받기"); expect(await screen.findByRole("alert")).toHaveProperty("textContent", "이메일을 입력해 주세요.다시 시도");
  await user.type(screen.getByRole("textbox", { name: "이메일" }), "fixture@example.test");
  await user.click(screen.getByRole("checkbox")); await click("무료 베타 초대받기"); await capture("done");
  expect(post.mock.calls.map(([body]) => body.action)).toEqual(["view", "quiz_started", "quiz_completed", "result_viewed", "experience_started", "experience_completed", "beta_form_viewed", "lead_submitted"]);
  expect(window.location.pathname).toBe("/beta");
});

it("keeps the modules owning reusable flow views free of legacy API and session imports", () => {
  const root = process.cwd();
  const candidates = ["components/marketing/recording-flow-views.tsx", "components/marketing/marketing-demand-validation-screen.tsx"].map(path => resolve(root, path)).filter(existsSync);
  const owners = new Set<string>();
  for (const name of ["Result", "Experience", "Planner", "Packaged", "BetaForm", "Done"]) {
    const owner = candidates.find(path => {
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      return source.statements.some(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    });
    expect(owner, `missing view definition: ${name}`).toBeTruthy(); owners.add(owner!);
  }
  const visited = new Set<string>(); const forbidden: string[] = [];
  function walk(path: string) {
    if (visited.has(path)) return; visited.add(path);
    if (path.includes("/lib/api/") || path.endsWith("/marketing-validation-client-session.ts")) { forbidden.push(path.slice(root.length + 1)); return; }
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const spec = node.moduleSpecifier.text;
      if (!spec.startsWith("@/") && !spec.startsWith(".")) continue;
      const base = spec.startsWith("@/") ? resolve(root, spec.slice(2)) : resolve(dirname(path), spec);
      const dependency = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(file => existsSync(file) && /\.tsx?$/.test(file));
      if (dependency) walk(dependency);
    }
  }
  owners.forEach(walk);
  expect(forbidden).toEqual([]);
});
