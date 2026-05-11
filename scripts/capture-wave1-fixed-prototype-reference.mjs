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
      return !!root && (root.textContent || "").trim().length > 80;
    },
    { timeout: 30000 },
  );
  await page.waitForTimeout(900);
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
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });

    const url =
      viewport.isMobile && definition.tab
        ? `${baseUrl}/index.html?screen=${definition.tab}`
        : viewport.isMobile
          ? `${baseUrl}/index.html?phone=1`
          : `${baseUrl}/index.html`;

    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await waitForPrototypeReady(page);
    await installStableCaptureCss(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    if (definition.interact) {
      await definition.interact(page);
    }

    await page.waitForTimeout(250);
    const outputPath = referencePathFor(viewportId, surface.id);
    await page.screenshot({ path: outputPath, fullPage: false });
    return outputPath;
  } finally {
    await context.close();
  }
}

async function main() {
  await assertManifestMatchesCaptureSet();
  await mkdir(REFERENCE_DIR, { recursive: true });

  const prototypeServer = await startPrototypeServer();
  const browser = await chromium.launch({ headless: true });

  try {
    log(`Using fixed prototype: ${PROTOTYPE_DIR}`);
    log(`Serving reference prototype at: ${prototypeServer.baseUrl}`);

    for (const surface of SURFACES) {
      for (const viewportId of ["mobile-390", "mobile-320"]) {
        if (!surface.mobile) {
          continue;
        }
        const outputPath = await capture({ browser, baseUrl: prototypeServer.baseUrl, viewportId, surface });
        log(`captured ${viewportId} ${surface.surface} -> ${path.basename(outputPath)}`);
      }

      if (surface.desktop) {
        const outputPath = await capture({
          browser,
          baseUrl: prototypeServer.baseUrl,
          viewportId: "desktop-1280",
          surface,
        });
        log(`captured desktop-1280 ${surface.surface} -> ${path.basename(outputPath)}`);
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
