#!/usr/bin/env node

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  assertNoRemoteSupabaseViolations,
  assertStage4ServerEnvironment,
  assertStableProfileIdentity,
  buildStage4AccountQuarantineFixtureCookie,
  buildConservativeStateMatrix,
  buildStage4NavigationOptions,
  canPromoteStage4Evidence,
  pollStage4LocalProfile,
  parseStage4CaptureArgs,
  summarizeStage4Quality,
  validateStage4TargetAttestation,
} from "./lib/cooking-meal-log-stage4-isolated.mjs";

const SLICE = "cooking-meal-log-cross-slice-release-qa";
const CLEAN_WORKTREE_COMMAND = "git status --porcelain";
const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DETAIL_RECIPE_ID = "550e8400-e29b-41d4-a716-446655440022";
const MAIN_ACCOUNT = {
  button: "로컬 테스트 계정으로 시작",
  email: "local-tester@homecook.local",
};
const OTHER_ACCOUNT = {
  button: "다른 테스트 계정으로 시작",
  email: "local-other@homecook.local",
};

const VIEWPORTS = [
  { height: 844, label: "mobile-default", scale: 2, width: 390 },
  { height: 568, label: "mobile-narrow", scale: 2, width: 320 },
  { height: 1000, label: "desktop", scale: 1, width: 1440 },
];

const SCREENS = [
  {
    auth: "guest",
    expected: ["계정 확인이 필요해요", "지원 / Manual Only"],
    id: "ACCOUNT_QUARANTINE",
    observedState: "auth-absent-support-only",
    path: "/account-quarantine",
    requiredStates: [
      "loading",
      "error",
      "unauthorized",
      "maintenance",
      "cleanup_pending",
      "pending",
      "replay",
      "conflict",
      "auth-absent-support-only",
    ],
  },
  {
    auth: "main",
    expected: ["무엇을 먹든"],
    id: "HOME",
    observedState: "recipe-only",
    path: "/",
    requiredStates: [
      "loading",
      "empty",
      "error",
      "recipe-only",
      "private-quarantined-deleted-nondisclosure",
    ],
  },
  {
    auth: "main",
    expected: ["집밥 김치찌개"],
    id: "RECIPE_DETAIL",
    observedState: "public-read-only",
    path: `/recipe/${DETAIL_RECIPE_ID}`,
    requiredStates: [
      "loading",
      "error",
      "unauthorized",
      "public-read-only",
      "owner-edit-delete",
      "future-impact-conflict",
    ],
  },
  {
    auth: "main",
    expected: ["직접 등록"],
    id: "MANUAL_RECIPE_CREATE",
    observedState: "validation",
    path: "/menu/add/manual",
    requiredStates: [
      "loading",
      "error",
      "unauthorized",
      "validation",
      "dirty-state",
      "managed-image-pending-cancel-error",
    ],
  },
  {
    auth: "main",
    expected: ["플래너"],
    id: "PLANNER_WEEK",
    observedState: "planned-meals",
    path: "/planner",
    requiredStates: [
      "loading",
      "empty",
      "error",
      "unauthorized",
      "completed-shopping-read-only",
      "legacy-product-read-only-delete",
    ],
  },
  {
    auth: "main",
    expected: ["요리모드"],
    id: "COOK_MODE",
    observedState: "standalone-ready",
    path: `/cooking/recipes/${DETAIL_RECIPE_ID}/cook-mode?servings=2`,
    requiredStates: [
      "loading",
      "error",
      "unauthorized",
      "maintenance",
      "cancelled-read-only",
      "completed-read-only",
      "missing",
      "unrecoverable",
    ],
  },
  {
    auth: "main",
    expected: ["남은 요리"],
    id: "LEFTOVERS",
    observedState: "empty",
    path: "/leftovers",
    requiredStates: [
      "loading",
      "empty",
      "error",
      "unauthorized",
      "pending",
      "replay",
      "conflict",
      "missing",
      "unrecoverable",
      "depleted-read-only",
    ],
  },
  {
    auth: "main",
    expected: ["식사 기록"],
    id: "MEAL_LOG",
    observedState: "empty",
    path: "/planner?segment=log",
    requiredStates: [
      "loading",
      "empty",
      "error",
      "unauthorized",
      "partial",
      "unavailable",
      "deleted-column",
      "missing",
      "unrecoverable",
      "pending",
      "replay",
      "conflict",
    ],
  },
];

const REQUIRED_SCREENSHOTS = [
  "ACCOUNT_QUARANTINE-mobile-default.png",
  "ACCOUNT_QUARANTINE-mobile-narrow.png",
  "ACCOUNT_QUARANTINE-desktop.png",
  "HOME-mobile-default.png",
  "HOME-mobile-narrow.png",
  "HOME-desktop.png",
  "RECIPE_DETAIL-mobile-default.png",
  "RECIPE_DETAIL-mobile-narrow.png",
  "RECIPE_DETAIL-desktop.png",
  "MANUAL_RECIPE_CREATE-mobile-default.png",
  "MANUAL_RECIPE_CREATE-mobile-narrow.png",
  "MANUAL_RECIPE_CREATE-desktop.png",
  "PLANNER_WEEK-mobile-default.png",
  "PLANNER_WEEK-mobile-narrow.png",
  "PLANNER_WEEK-desktop.png",
  "COOK_MODE-mobile-default.png",
  "COOK_MODE-mobile-narrow.png",
  "COOK_MODE-desktop.png",
  "LEFTOVERS-mobile-default.png",
  "LEFTOVERS-mobile-narrow.png",
  "LEFTOVERS-desktop.png",
  "MEAL_LOG-mobile-default.png",
  "MEAL_LOG-mobile-narrow.png",
  "MEAL_LOG-desktop.png",
];

const REQUIRED_STATE_MATRICES = [
  "ACCOUNT_QUARANTINE-state-matrix.json",
  "HOME-state-matrix.json",
  "RECIPE_DETAIL-state-matrix.json",
  "MANUAL_RECIPE_CREATE-state-matrix.json",
  "PLANNER_WEEK-state-matrix.json",
  "COOK_MODE-state-matrix.json",
  "LEFTOVERS-state-matrix.json",
  "MEAL_LOG-state-matrix.json",
];

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function assertLoopbackBaseUrl(value) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "http:"
    || !new Set(["127.0.0.1", "localhost"]).has(parsed.hostname)
  ) {
    throw new Error("Stage 4 capture BASE_URL must be loopback http only");
  }
  return parsed.origin;
}

function assertAttemptId(value) {
  if (
    typeof value !== "string"
    || !/^[a-z0-9][a-z0-9._-]{2,95}$/u.test(value)
    || value.includes("..")
  ) {
    throw new Error("--attempt-id is required and must be a safe lowercase id");
  }
}

async function sha256(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

async function hideDevUi(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-duration: 0s !important;
      }
      nextjs-portal,
      [data-nextjs-dev-tools-button],
      [data-nextjs-dev-tools-indicator],
      [data-nextjs-dialog],
      [data-nextjs-dialog-overlay],
      [data-nextjs-toast],
      [data-nextjs-terminal],
      [data-nextjs-build-error] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `,
  });
}

async function loginWithLocalAccount(page, baseUrl, account) {
  await page.goto(
    `${baseUrl}/login?next=%2F`,
    buildStage4NavigationOptions(),
  );
  if (!new URL(page.url()).pathname.startsWith("/login")) return;
  const button = page.getByRole("button", { name: account.button });
  await button.waitFor({ state: "visible", timeout: 20_000 });
  await button.click();
  await page.waitForURL(
    (url) => url.origin === baseUrl && !url.pathname.startsWith("/login"),
    { timeout: 30_000 },
  );

  const profile = await pollStage4LocalProfile({
    expectedEmail: account.email,
    getDelayMs: ({ attemptCount }) => Math.min(250, attemptCount * 100),
    probe: async () => page.evaluate(async () => {
      const response = await fetch("/api/v1/users/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      return {
        payload,
        status: response.status,
      };
    }),
  });

  return profile;
}

async function waitForExpectedContent(page, expected) {
  await page.waitForFunction(
    (tokens) => {
      const body = document.body?.innerText ?? "";
      return tokens.some((token) => body.includes(token));
    },
    expected,
    { timeout: 30_000 },
  );
}

async function inspectPage(page, viewport) {
  const geometry = await page.evaluate((isMobile) => {
    const root = document.documentElement;
    const smallTargets = isMobile
      ? Array.from(
        document.querySelectorAll(
          "a[href], button, input, select, textarea, [role='button'], [role='tab']",
        ),
      )
        .filter((node) => {
          const element = /** @type {HTMLElement} */ (node);
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none"
            && style.visibility !== "hidden"
            && rect.width > 0
            && rect.height > 0
            && (rect.width < 44 || rect.height < 44);
        })
        .slice(0, 30)
        .map((node) => {
          const element = /** @type {HTMLElement} */ (node);
          const rect = element.getBoundingClientRect();
          return {
            height: Math.round(rect.height * 10) / 10,
            label: element.getAttribute("aria-label")
              ?? element.textContent?.trim().slice(0, 80)
              ?? element.tagName,
            width: Math.round(rect.width * 10) / 10,
          };
        })
      : [];
    return {
      client_width: root.clientWidth,
      horizontal_overflow_px: Math.max(0, root.scrollWidth - root.clientWidth),
      scroll_width: root.scrollWidth,
      touch_target_failures: smallTargets,
    };
  }, viewport.width < 600);

  const axe = await new AxeBuilder({ page }).analyze();
  const serious = axe.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );
  return {
    ...geometry,
    serious_or_critical_axe: serious.map(({ help, id, impact, nodes }) => ({
      help,
      id,
      impact,
      nodes: nodes.length,
    })),
  };
}

async function captureScreen({
  baseUrl,
  outputDir,
  page,
  remoteSupabaseViolations,
  screen,
  viewport,
}) {
  await page.setViewportSize({ height: viewport.height, width: viewport.width });
  await page.goto(
    `${baseUrl}${screen.path}`,
    buildStage4NavigationOptions(),
  );
  await waitForExpectedContent(page, screen.expected);
  await hideDevUi(page);
  await page.evaluate(() => window.scrollTo({ left: 0, top: 0 }));
  await page.waitForTimeout(500);

  const currentUrl = new URL(page.url());
  if (currentUrl.origin !== baseUrl) {
    throw new Error(`${screen.id} left the loopback app origin`);
  }
  const expectedPathname = new URL(screen.path, baseUrl).pathname;
  if (currentUrl.pathname !== expectedPathname) {
    throw new Error(
      `${screen.id} redirected away from ${expectedPathname}: ${currentUrl.pathname}`,
    );
  }
  if (screen.auth === "main" && currentUrl.pathname.startsWith("/login")) {
    throw new Error(`${screen.id} lost the authenticated local session`);
  }
  if (remoteSupabaseViolations.length > 0) {
    throw new Error(
      `remote Supabase request detected: ${remoteSupabaseViolations.join(", ")}`,
    );
  }

  const metrics = await inspectPage(page, viewport);
  const fileName = `${screen.id}-${viewport.label}.png`;
  await page.screenshot({
    animations: "disabled",
    fullPage: false,
    path: path.join(outputDir, fileName),
  });
  return {
    actual_url: page.url(),
    file: fileName,
    metrics,
    observed_state: screen.observedState,
    viewport: {
      height: viewport.height,
      label: viewport.label,
      width: viewport.width,
    },
  };
}

async function createPage(context, remoteSupabaseViolations) {
  const page = await context.newPage();
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      const isSupabase = url.hostname.endsWith(".supabase.co")
        || request.headers()["apikey"] !== undefined;
      const isLoopback = new Set(["127.0.0.1", "localhost"]).has(url.hostname);
      if (isSupabase && !isLoopback) {
        remoteSupabaseViolations.push(url.origin);
      }
    } catch {
      // Browser-internal URLs do not participate in target validation.
    }
  });
  return page;
}

async function main() {
  const args = parseStage4CaptureArgs(process.argv.slice(2), {
    defaultBaseUrl: DEFAULT_BASE_URL,
  });
  assertAttemptId(args.attemptId);
  const baseUrl = assertLoopbackBaseUrl(args.baseUrl);
  const repositoryRoot = await realpath(gitOutput(["rev-parse", "--show-toplevel"]));
  if (repositoryRoot !== await realpath(process.cwd())) {
    throw new Error("capture must run from the repository root");
  }
  const sourceHeadSha = gitOutput(["rev-parse", "HEAD"]);
  if (gitOutput(["status", "--porcelain", "--untracked-files=all"]) !== "") {
    throw new Error(
      `${CLEAN_WORKTREE_COMMAND} must be empty before real-stack capture`,
    );
  }
  if (!args.targetAttestation) {
    throw new Error("--target-attestation is required for real-stack capture");
  }
  const targetAttestation = validateStage4TargetAttestation(
    JSON.parse(await readFile(path.resolve(args.targetAttestation), "utf8")),
    baseUrl,
  );
  if (targetAttestation.source_head_sha !== sourceHeadSha) {
    throw new Error("target attestation source head does not match capture HEAD");
  }
  assertStage4ServerEnvironment(process.env, targetAttestation);

  const response = await fetch(baseUrl, { redirect: "manual" });
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`loopback app health failed with ${response.status}`);
  }

  const evidenceParent = path.join(
    repositoryRoot,
    "ui/designs/evidence",
  );
  const finalDir = path.join(evidenceParent, SLICE);
  const stagingParent = path.join(
    repositoryRoot,
    ".artifacts",
    SLICE,
    "stage4-captures",
  );
  const temporaryDir = path.join(
    stagingParent,
    args.attemptId,
  );
  await mkdir(stagingParent, { recursive: true, mode: 0o700 });
  await mkdir(temporaryDir, { recursive: false, mode: 0o700 });

  const generatedAt = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const observations = new Map(SCREENS.map(({ id }) => [id, []]));
  const remoteSupabaseViolations = [];
  const ownerBoundary = {
    main_authenticated: false,
    main_profile_sha256: null,
    other_authenticated: false,
    other_profile_sha256: null,
    distinct_profiles: false,
    private_nondisclosure: "pending",
  };

  try {
    for (const viewport of VIEWPORTS) {
      const guestContext = await browser.newContext({
        deviceScaleFactor: viewport.scale,
        viewport: { height: viewport.height, width: viewport.width },
      });
      await guestContext.addCookies([buildStage4AccountQuarantineFixtureCookie(baseUrl)]);
      const guestPage = await createPage(guestContext, remoteSupabaseViolations);
      const accountScreen = SCREENS.find(({ id }) => id === "ACCOUNT_QUARANTINE");
      observations.get(accountScreen.id).push(
        await captureScreen({
          baseUrl,
          outputDir: temporaryDir,
          page: guestPage,
          remoteSupabaseViolations,
          screen: accountScreen,
          viewport,
        }),
      );
      await guestContext.close();

      const mainContext = await browser.newContext({
        deviceScaleFactor: viewport.scale,
        viewport: { height: viewport.height, width: viewport.width },
      });
      const mainPage = await createPage(mainContext, remoteSupabaseViolations);
      const mainProfile = await loginWithLocalAccount(
        mainPage,
        baseUrl,
        MAIN_ACCOUNT,
      );
      ownerBoundary.main_authenticated = true;
      ownerBoundary.main_profile_sha256 = assertStableProfileIdentity(
        ownerBoundary.main_profile_sha256,
        createHash("sha256")
        .update(mainProfile.id)
          .digest("hex"),
      );
      for (const screen of SCREENS.filter(({ auth }) => auth === "main")) {
        observations.get(screen.id).push(
          await captureScreen({
            baseUrl,
            outputDir: temporaryDir,
            page: mainPage,
            remoteSupabaseViolations,
            screen,
            viewport,
          }),
        );
      }
      await mainContext.close();
    }

    const otherViewport = VIEWPORTS.find(({ label }) => label === "desktop");
    const otherContext = await browser.newContext({
      viewport: { height: otherViewport.height, width: otherViewport.width },
    });
    const otherPage = await createPage(otherContext, remoteSupabaseViolations);
    const otherProfile = await loginWithLocalAccount(
      otherPage,
      baseUrl,
      OTHER_ACCOUNT,
    );
    await otherPage.goto(
      `${baseUrl}/planner`,
      buildStage4NavigationOptions(),
    );
    await waitForExpectedContent(otherPage, ["플래너"]);
    ownerBoundary.other_authenticated = true;
    ownerBoundary.other_profile_sha256 = createHash("sha256")
      .update(otherProfile.id)
      .digest("hex");
    ownerBoundary.distinct_profiles =
      ownerBoundary.main_profile_sha256 !== ownerBoundary.other_profile_sha256;
    if (!ownerBoundary.distinct_profiles) {
      throw new Error("local main/other owner boundary resolved to one profile");
    }
    await otherContext.close();
    assertNoRemoteSupabaseViolations(remoteSupabaseViolations);
  } finally {
    await browser.close();
  }

  for (const screen of SCREENS) {
    const stateProjection = buildConservativeStateMatrix({
      observedStateCandidate: screen.observedState,
      requiredStates: screen.requiredStates,
    });
    const quality = summarizeStage4Quality(observations.get(screen.id));
    await writeJson(path.join(temporaryDir, `${screen.id}-state-matrix.json`), {
      fixture_routes: false,
      generated_at: generatedAt,
      ...stateProjection,
      quality,
      real_local_stack: targetAttestation.pinned_isolated_local,
      required_states: screen.requiredStates,
      screen: screen.id,
      source_head_sha: sourceHeadSha,
      viewport_observations: observations.get(screen.id),
    });
  }

  const artifactNames = [
    ...REQUIRED_SCREENSHOTS,
    ...REQUIRED_STATE_MATRICES,
  ];
  const artifacts = [];
  for (const file of artifactNames) {
    const filePath = path.join(temporaryDir, file);
    const metadata = await stat(filePath);
    artifacts.push({
      bytes: metadata.size,
      file,
      sha256: await sha256(filePath),
    });
  }
  const quality = summarizeStage4Quality(
    [...observations.values()].flat(),
  );
  const stage4Complete = false;
  const canonicalPromotion = canPromoteStage4Evidence({
    qualityStatus: quality.quality_status,
    stage4Complete,
  });
  await writeJson(path.join(temporaryDir, "manifest.json"), {
    artifacts,
    attempt_id: args.attemptId,
    base_url: baseUrl,
    canonical_promotion: canonicalPromotion,
    fixture_routes: false,
    generated_at: generatedAt,
    owner_boundary: ownerBoundary,
    quality,
    real_local_stack: targetAttestation.pinned_isolated_local,
    remote_linked_cloud_access:
      targetAttestation.remote_linked_cloud_access,
    required_screenshot_count: REQUIRED_SCREENSHOTS.length,
    source_head_sha: sourceHeadSha,
    stage4_complete: stage4Complete,
    target_attestation: targetAttestation,
  });
  let evidenceDir = temporaryDir;
  if (canonicalPromotion) {
    try {
      await stat(finalDir);
      throw new Error(`create-only evidence directory already exists: ${finalDir}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await mkdir(evidenceParent, { recursive: true });
    await rename(temporaryDir, finalDir);
    evidenceDir = finalDir;
  }
  process.stdout.write(`${JSON.stringify({
    artifact_count: artifacts.length + 1,
    canonical_promotion: canonicalPromotion,
    evidence_dir: evidenceDir,
    owner_boundary: ownerBoundary,
    source_head_sha: sourceHeadSha,
    stage4_complete: stage4Complete,
  })}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
