#!/usr/bin/env node

import { chromium } from "@playwright/test";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const PROTOTYPE_DIR = path.join(
  ROOT,
  "ui/designs/prototypes/claude-design-260505-wave1",
);
const REFERENCE_DIR = path.join(
  ROOT,
  "ui/designs/reference/wave1-fixed-prototype",
);
const MANIFEST_PATH = path.join(REFERENCE_DIR, "manifest.json");

const VIEWPORTS = {
  "mobile-390": { width: 390, height: 844, isMobile: true },
  "mobile-320": { width: 320, height: 568, isMobile: true },
  "desktop-1280": { width: 1280, height: 900, isMobile: false },
};

const DEFAULT_MENU_ADD_ARGS = {
  date: "4/23",
  slot: "점심",
};

const SURFACES = [
  {
    id: "home",
    surface: "HOME",
    mobile: { tab: "home" },
    desktop: { route: { tab: "home" } },
  },
  {
    id: "recipe-detail",
    surface: "RECIPE_DETAIL",
    mobile: { route: { tab: "home", detail: "r4" } },
  },
  {
    id: "planner",
    surface: "PLANNER_WEEK",
    mobile: { tab: "planner" },
    desktop: { route: { tab: "planner" } },
  },
  {
    id: "planner-meal-add",
    surface: "MENU_ADD",
    mobile: {
      tab: "planner",
      interact: async (page) => {
        const addButton = page.locator("button").filter({ hasText: /식사 추가/ }).first();
        await addButton.click({ timeout: 10000 });
        await page.waitForTimeout(500);
      },
    },
  },
  {
    id: "shopping-detail",
    surface: "SHOPPING_DETAIL",
    mobile: { route: { tab: "mypage", page: "shopping-detail", pageArgs: { listId: "sl_1" } } },
  },
  {
    id: "pantry",
    surface: "PANTRY",
    mobile: { tab: "pantry" },
  },
  {
    id: "mypage",
    surface: "MYPAGE",
    mobile: { tab: "mypage" },
    desktop: { route: { tab: "mypage" } },
  },
  {
    id: "settings",
    surface: "SETTINGS",
    mobile: { route: { tab: "mypage", page: "settings" } },
    desktop: { route: { tab: "mypage", page: "settings" } },
  },
  {
    id: "account",
    surface: "ACCOUNT",
    mobile: { route: { tab: "mypage", page: "mypage-account" } },
  },
  {
    id: "leftovers",
    surface: "LEFTOVERS",
    mobile: { route: { tab: "mypage", page: "leftovers" } },
    desktop: { route: { tab: "mypage", page: "leftovers" } },
  },
  {
    id: "login",
    surface: "LOGIN",
    mobile: { route: { tab: "home", page: "login" } },
  },
  {
    id: "login-gate-modal",
    surface: "GLOBAL::LoginGateModal",
    mobile: {
      route: { tab: "home" },
      modal: "login-gate",
      interact: async (page) => {
        await waitForText(page, "로그인이 필요해요");
      },
    },
  },
  {
    id: "ate-list",
    surface: "ATE_LIST",
    mobile: {
      route: { tab: "mypage", page: "leftovers" },
      interact: async (page) => {
        await clickButtonByName(page, "✓ 다먹음");
        await clickButtonByName(page, "다먹은 요리");
        await waitForText(page, "남은 요리로");
      },
    },
  },
  {
    id: "recipebook-detail",
    surface: "RECIPEBOOK_DETAIL",
    mobile: {
      route: {
        tab: "mypage",
        page: "mypage-recipebook-detail",
        pageArgs: { bookId: "b_custom1" },
      },
    },
  },
  {
    id: "meal-screen",
    surface: "MEAL_SCREEN",
    mobile: {
      route: {
        tab: "planner",
        page: "meal-detail",
        pageArgs: { date: "4/23", slot: "아침" },
      },
    },
  },
  {
    id: "shopping-flow-select",
    surface: "SHOPPING_FLOW_SELECT",
    mobile: { route: { tab: "planner", page: "shopping-create" } },
  },
  {
    id: "shopping-flow-review",
    surface: "SHOPPING_FLOW_REVIEW",
    mobile: {
      route: { tab: "planner", page: "shopping-create" },
      interact: async (page) => {
        await clickButtonByName(page, "장보기 목록 만들기");
        await waitForText(page, "STEP 2 / 2");
      },
    },
  },
  {
    id: "cook-ready-list",
    surface: "COOK_READY_LIST",
    mobile: { route: { tab: "planner", page: "cook-list" } },
  },
  {
    id: "cook-mode-planner",
    surface: "COOK_MODE_PLANNER",
    mobile: {
      route: {
        tab: "planner",
        page: "cook-run",
        pageArgs: { date: "4/23", slot: "점심", mealIndex: 0 },
      },
    },
  },
  {
    id: "cook-mode-standalone",
    surface: "COOK_MODE_STANDALONE",
    mobile: {
      route: {
        tab: "home",
        page: "cook-run",
        pageArgs: { recipeId: "r4" },
      },
    },
  },
  {
    id: "manual-recipe-create",
    surface: "MANUAL_RECIPE_CREATE",
    mobile: {
      route: {
        tab: "planner",
        page: "manual-create",
        pageArgs: DEFAULT_MENU_ADD_ARGS,
      },
    },
  },
  {
    id: "yt-import",
    surface: "YT_IMPORT",
    mobile: {
      route: {
        tab: "planner",
        page: "yt-import",
        pageArgs: DEFAULT_MENU_ADD_ARGS,
      },
    },
  },
  {
    id: "yt-import-review",
    surface: "YT_IMPORT_REVIEW",
    mobile: {
      route: {
        tab: "planner",
        page: "yt-import",
        pageArgs: DEFAULT_MENU_ADD_ARGS,
      },
      interact: async (page) => {
        await page.getByPlaceholder("https://youtu.be/...").fill("https://youtu.be/homecook-demo");
        await clickButtonByName(page, "가져오기");
        await waitForText(page, "추출 결과 확인", { timeout: 3000 });
      },
    },
  },
  {
    id: "recipe-search-picker",
    surface: "MENU_ADD_RECIPE_SEARCH_PICKER",
    mobile: {
      route: {
        tab: "planner",
        page: "menu-add",
        pageArgs: { ...DEFAULT_MENU_ADD_ARGS, mode: "search" },
      },
    },
  },
  {
    id: "recipe-book-selector",
    surface: "MENU_ADD_RECIPE_BOOK_SELECTOR",
    mobile: {
      route: {
        tab: "planner",
        page: "menu-add",
        pageArgs: { ...DEFAULT_MENU_ADD_ARGS, mode: "books" },
      },
    },
  },
  {
    id: "recipe-book-detail-picker",
    surface: "MENU_ADD_RECIPE_BOOK_DETAIL_PICKER",
    mobile: {
      route: {
        tab: "planner",
        page: "menu-add",
        pageArgs: { ...DEFAULT_MENU_ADD_ARGS, mode: "books" },
      },
      interact: async (page) => {
        await clickButtonByName(page, "평일 저녁 빠른요리");
        await waitForText(page, "제육볶음");
      },
    },
  },
  {
    id: "pantry-match-picker",
    surface: "MENU_ADD_PANTRY_MATCH_PICKER",
    mobile: {
      route: {
        tab: "planner",
        page: "menu-add",
        pageArgs: { ...DEFAULT_MENU_ADD_ARGS, mode: "pantry-match" },
      },
    },
  },
  {
    id: "planned-servings-input",
    surface: "MENU_ADD_PLANNED_SERVINGS_INPUT",
    mobile: {
      route: {
        tab: "planner",
        page: "menu-add",
        pageArgs: { ...DEFAULT_MENU_ADD_ARGS, mode: "search" },
      },
      interact: async (page) => {
        await page.getByText("선택", { exact: true }).first().click({ timeout: 10000 });
        await waitForText(page, "추가하기");
      },
    },
  },
  {
    id: "pantry-add-sheet",
    surface: "PANTRY_ADD_SHEET",
    mobile: {
      tab: "pantry",
      interact: async (page) => {
        await clickButtonByName(page, "재료 추가", { exact: true });
        await page.getByPlaceholder("재료 검색").first().waitFor({
          state: "visible",
          timeout: 10000,
        });
        await page.waitForTimeout(500);
      },
    },
  },
  {
    id: "pantry-bundle-picker",
    surface: "PANTRY_BUNDLE_PICKER",
    mobile: {
      tab: "pantry",
      interact: async (page) => {
        await clickButtonByName(page, "묶음 추가", { exact: true });
        await waitForText(page, "재료 묶음 선택");
      },
    },
  },
  {
    id: "planner-add-popup",
    surface: "RECIPE_DETAIL_PLANNER_ADD_POPUP",
    mobile: {
      route: { tab: "home", detail: "r4" },
      interact: async (page) => {
        await clickButtonByName(page, "플래너에 추가");
        await waitForText(page, "날짜");
      },
    },
  },
  {
    id: "save-popup",
    surface: "RECIPE_DETAIL_SAVE_POPUP",
    mobile: {
      route: { tab: "home", detail: "r4" },
      interact: async (page) => {
        await page
          .locator('button:has(path[d="M6 3h12v18l-6-4-6 4V3z"])')
          .first()
          .click({ timeout: 10000 });
        await waitForText(page, "레시피북 다중 선택");
      },
    },
  },
  {
    id: "home-sort-open-state",
    surface: "HOME_SORT_OPEN_STATE",
    mobile: {
      tab: "home",
      interact: async (page) => {
        await clickButtonByName(page, "최신순");
        await waitForText(page, "저장순");
      },
    },
  },
  {
    id: "ingredient-filter-modal",
    surface: "HOME_INGREDIENT_FILTER_MODAL",
    mobile: {
      tab: "home",
      interact: async (page) => {
        await clickButtonByName(page, "재료로 검색");
        await waitForText(page, "필터 적용");
      },
    },
  },
  {
    id: "pantry-reflect-picker",
    surface: "SHOPPING_DETAIL_PANTRY_REFLECT_PICKER",
    mobile: {
      route: {
        tab: "mypage",
        page: "shopping-detail",
        pageArgs: { listId: "sl_1" },
      },
      interact: async (page) => {
        await clickButtonByName(page, "장보기 완료");
        await waitForText(page, "팬트리에 반영할까요?");
      },
    },
  },
  {
    id: "consumed-ingredient-checklist",
    surface: "COOK_MODE_CONSUMED_INGREDIENT_CHECKLIST",
    mobile: {
      route: {
        tab: "planner",
        page: "cook-run",
        pageArgs: { date: "4/23", slot: "점심", mealIndex: 0 },
      },
      interact: async (page) => {
        await clickButtonByName(page, "요리 완료");
        await waitForText(page, "소진된 재료를 확인해주세요");
      },
    },
  },
  {
    id: "nickname-edit-sheet",
    surface: "SETTINGS_NICKNAME_EDIT_SHEET",
    mobile: {
      route: { tab: "mypage", page: "mypage-account" },
      interact: async (page) => {
        await clickButtonByName(page, "닉네임 변경");
        await waitForText(page, "닉네임 변경");
      },
    },
  },
  {
    id: "logout-confirm",
    surface: "SETTINGS_LOGOUT_CONFIRM",
    mobile: {
      route: { tab: "mypage", page: "mypage-account" },
      interact: async (page) => {
        await clickButtonByName(page, "로그아웃");
        await waitForText(page, "로그아웃 할까요?");
      },
    },
  },
  {
    id: "account-delete-confirm",
    surface: "SETTINGS_ACCOUNT_DELETE_CONFIRM",
    mobile: {
      route: { tab: "mypage", page: "mypage-account" },
      interact: async (page) => {
        await clickButtonByName(page, "회원탈퇴");
        await waitForText(page, "정말 탈퇴하시겠어요?");
      },
    },
  },
  {
    id: "recipebook-delete-confirm",
    surface: "MYPAGE_RECIPEBOOK_DELETE_CONFIRM",
    mobile: {
      route: {
        tab: "mypage",
        page: "mypage-recipebook-detail",
        pageArgs: { bookId: "b_custom1" },
      },
      interact: async (page) => {
        await clickButtonByName(page, "삭제", { exact: true });
        await waitForText(page, "이 레시피북을 삭제할까요?");
      },
    },
  },
  {
    id: "mypage-recipebook-tab",
    surface: "MYPAGE_RECIPEBOOK_TAB",
    mobile: { route: { tab: "mypage", page: "mypage-recipebook" } },
  },
  {
    id: "mypage-shopping-lists-tab",
    surface: "MYPAGE_SHOPPING_LISTS_TAB",
    mobile: { route: { tab: "mypage", page: "mypage-shopping" } },
  },
];

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jsx", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

function log(message) {
  process.stdout.write(`${message}\n`);
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function fileNameFor(viewportId, surfaceId) {
  return `${viewportId}-${surfaceId}.png`;
}

function referencePathFor(viewportId, surfaceId) {
  return path.join(REFERENCE_DIR, fileNameFor(viewportId, surfaceId));
}

function parseArgs(argv) {
  const args = {
    force: false,
    only: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (arg === "--only") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--only requires a comma-separated surface id list.");
      }
      args.only = new Set(
        value
          .split(",")
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean),
      );
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function shouldIncludeSurface(surface, args) {
  if (!args.only) {
    return true;
  }
  return args.only.has(surface.id.toLowerCase()) || args.only.has(surface.surface.toLowerCase());
}

function manifestArtifactSet(manifest) {
  return new Set(
    (manifest.screenshots ?? [])
      .map((entry) => entry.path)
      .filter(Boolean),
  );
}

function expectedArtifacts() {
  const artifacts = [];
  for (const surface of SURFACES) {
    for (const viewportId of ["mobile-390", "mobile-320"]) {
      if (surface.mobile) {
        artifacts.push(
          toPosix(path.relative(ROOT, referencePathFor(viewportId, surface.id))),
        );
      }
    }
    if (surface.desktop) {
      artifacts.push(
        toPosix(path.relative(ROOT, referencePathFor("desktop-1280", surface.id))),
      );
    }
  }
  return artifacts;
}

async function assertManifestMatchesCaptureSet() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const manifestSet = manifestArtifactSet(manifest);
  const expectedSet = new Set(expectedArtifacts());
  const missingFromManifest = [...expectedSet].filter((entry) => !manifestSet.has(entry));
  const staleInManifest = [...manifestSet].filter((entry) => !expectedSet.has(entry));

  if (missingFromManifest.length > 0 || staleInManifest.length > 0) {
    throw new Error(
      [
        "Wave1 reference manifest does not match the capture set.",
        missingFromManifest.length ? `Missing from manifest: ${missingFromManifest.join(", ")}` : "",
        staleInManifest.length ? `Stale in manifest: ${staleInManifest.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function startPrototypeServer() {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const normalizedPath = decodedPath === "/" ? "/index.html" : decodedPath;
    const filePath = path.resolve(PROTOTYPE_DIR, `.${normalizedPath}`);
    const isInsidePrototypeDir =
      filePath === PROTOTYPE_DIR || filePath.startsWith(`${PROTOTYPE_DIR}${path.sep}`);

    if (!isInsidePrototypeDir || !existsSync(filePath)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": MIME_TYPES.get(path.extname(filePath)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  });

  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate local prototype server port."));
        return;
      }
      resolveServer({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
      });
    });
  });
}

async function installStableCaptureCss(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
      button[aria-label="전체화면"], .tweaks-panel {
        display: none !important;
      }
    `,
  });
}

async function waitForPrototypeReady(page) {
  await page.waitForFunction(
    () => {
      const root = document.querySelector("#root");
      return !!root && (root.textContent || "").trim().length > 20;
    },
    { timeout: 30000 },
  );
  await page.waitForTimeout(900);
}

async function waitForText(page, text, options = {}) {
  await page.getByText(text, { exact: options.exact ?? false }).first().waitFor({
    state: "visible",
    timeout: options.timeout ?? 10000,
  });
  await page.waitForTimeout(options.settle ?? 500);
}

async function clickButtonByName(page, name, options = {}) {
  await page.getByRole("button", { name, exact: options.exact ?? false }).first().click({
    timeout: options.timeout ?? 10000,
  });
  await page.waitForTimeout(options.settle ?? 500);
}

async function capture({ browser, baseUrl, viewportId, surface }) {
  const viewport = VIEWPORTS[viewportId];
  const definition = viewport.isMobile ? surface.mobile : surface.desktop;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    colorScheme: "light",
  });

  await context.addInitScript(
    ({ route, shell }) => {
      localStorage.clear();
      if (route) {
        localStorage.setItem("hc_route", JSON.stringify(route));
      }
      if (shell) {
        localStorage.setItem("hc_shell", shell);
      }
    },
    {
      route: definition.route ?? null,
      shell: viewport.isMobile ? null : "desktop",
    },
  );

  const page = await context.newPage();
  page.on("pageerror", (error) => {
    log(`pageerror ${viewportId} ${surface.surface}: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      log(`console error ${viewportId} ${surface.surface}: ${message.text()}`);
    }
  });
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });

    const url = new URL("/index.html", baseUrl);
    if (viewport.isMobile && definition.tab) {
      url.searchParams.set("screen", definition.tab);
    } else if (viewport.isMobile) {
      url.searchParams.set("phone", "1");
    }
    if (definition.modal) {
      url.searchParams.set("modal", definition.modal);
    }

    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 60000 });
    await waitForPrototypeReady(page);
    await installStableCaptureCss(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    if (definition.interact) {
      await definition.interact(page);
    }

    await page.waitForTimeout(250);
    const outputPath = referencePathFor(viewportId, surface.id);
    await page.screenshot({ path: outputPath, fullPage: false });
    return { outputPath, skipped: false };
  } catch (error) {
    throw new Error(`Failed to capture ${viewportId} ${surface.surface}`, { cause: error });
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await assertManifestMatchesCaptureSet();
  await mkdir(REFERENCE_DIR, { recursive: true });

  const prototypeServer = await startPrototypeServer();
  const browser = await chromium.launch({ headless: true });

  try {
    log(`Using fixed prototype: ${PROTOTYPE_DIR}`);
    log(`Serving reference prototype at: ${prototypeServer.baseUrl}`);

    for (const surface of SURFACES) {
      if (!shouldIncludeSurface(surface, args)) {
        continue;
      }

      for (const viewportId of ["mobile-390", "mobile-320"]) {
        if (!surface.mobile) {
          continue;
        }
        const outputPath = referencePathFor(viewportId, surface.id);
        if (!args.force && existsSync(outputPath)) {
          log(`skipped existing ${viewportId} ${surface.surface} -> ${path.basename(outputPath)}`);
          continue;
        }
        const result = await capture({ browser, baseUrl: prototypeServer.baseUrl, viewportId, surface });
        log(`captured ${viewportId} ${surface.surface} -> ${path.basename(result.outputPath)}`);
      }

      if (surface.desktop) {
        const outputPath = referencePathFor("desktop-1280", surface.id);
        if (!args.force && existsSync(outputPath)) {
          log(`skipped existing desktop-1280 ${surface.surface} -> ${path.basename(outputPath)}`);
          continue;
        }
        const result = await capture({
          browser,
          baseUrl: prototypeServer.baseUrl,
          viewportId: "desktop-1280",
          surface,
        });
        log(`captured desktop-1280 ${surface.surface} -> ${path.basename(result.outputPath)}`);
      }
    }

    log(`Wave1 fixed prototype reference screenshots saved to: ${REFERENCE_DIR}`);
  } finally {
    await browser.close();
    await prototypeServer.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
