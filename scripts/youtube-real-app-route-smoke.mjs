#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DEFAULT_PORT_START = 3200;
const TEST_EMAIL = "youtube-real-smoke@homecook.local";
const TEST_PASSWORD = "homecook-youtube-real-smoke";
const REPORT_SCHEMA = "youtube-live-extraction-report-v1";
const SMOKE_SCRIPT_PATH = "scripts/youtube-real-app-route-smoke.mjs";
const UI_VERIFIER_SCRIPT_PATH = "scripts/youtube-smoke-ui.mjs";
const RUN_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/u;

// Balanced 30 URL set from the slice 29 provider-level closeout smoke.
const SAMPLE_URLS = [
  {
    id: "structured-1",
    bucket: "structured",
    videoId: "-f-A4xLpDQE",
    url: "https://www.youtube.com/watch?v=-f-A4xLpDQE",
    note: "provider closeout: no description signal, no author recipe signal",
  },
  {
    id: "structured-2",
    bucket: "structured",
    videoId: "2UH5gMZoG14",
    url: "https://www.youtube.com/watch?v=2UH5gMZoG14",
    note: "provider closeout: comments disabled, description signal present",
  },
  {
    id: "structured-3",
    bucket: "structured",
    videoId: "vNwAQmppzyM",
    url: "https://www.youtube.com/watch?v=vNwAQmppzyM",
    note: "provider closeout: no description signal, no author recipe signal",
  },
  {
    id: "structured-4",
    bucket: "structured",
    videoId: "o1UIiJQeviQ",
    url: "https://www.youtube.com/watch?v=o1UIiJQeviQ",
    note: "provider closeout: description signal and author recipe signal",
  },
  {
    id: "structured-5",
    bucket: "structured",
    videoId: "G6pH-cVeHEY",
    url: "https://www.youtube.com/watch?v=G6pH-cVeHEY",
    note: "provider closeout: description signal and author recipe signal",
  },
  {
    id: "semi-structured-1",
    bucket: "semi_structured",
    videoId: "9fmd1LOTa-E",
    url: "https://www.youtube.com/watch?v=9fmd1LOTa-E",
    note: "provider closeout: description signal present",
  },
  {
    id: "semi-structured-2",
    bucket: "semi_structured",
    videoId: "HoqkIzuqFrU",
    url: "https://www.youtube.com/watch?v=HoqkIzuqFrU",
    note: "provider closeout: description signal and author recipe signal",
  },
  {
    id: "semi-structured-3",
    bucket: "semi_structured",
    videoId: "qvqX-KaeU8s",
    url: "https://www.youtube.com/watch?v=qvqX-KaeU8s",
    note: "provider closeout: description signal, author comment present without recipe signal",
  },
  {
    id: "semi-structured-4",
    bucket: "semi_structured",
    videoId: "eU6VoHNUTlM",
    url: "https://www.youtube.com/watch?v=eU6VoHNUTlM",
    note: "provider closeout: description signal present",
  },
  {
    id: "semi-structured-5",
    bucket: "semi_structured",
    videoId: "_PUFZM6vZQw",
    url: "https://www.youtube.com/watch?v=_PUFZM6vZQw",
    note: "provider closeout: no description signal, author recipe signal",
  },
  {
    id: "weak-1",
    bucket: "weak",
    videoId: "-sxyXlAFEhM",
    url: "https://www.youtube.com/watch?v=-sxyXlAFEhM",
    note: "provider closeout: description signal and author recipe signal",
  },
  {
    id: "weak-2",
    bucket: "weak",
    videoId: "KAMZSgRN4WQ",
    url: "https://www.youtube.com/watch?v=KAMZSgRN4WQ",
    note: "provider closeout: description signal and author recipe signal",
  },
  {
    id: "weak-3",
    bucket: "weak",
    videoId: "wyPm621Q0TE",
    url: "https://www.youtube.com/watch?v=wyPm621Q0TE",
    note: "provider closeout: no description signal, author recipe signal",
  },
  {
    id: "weak-4",
    bucket: "weak",
    videoId: "Wb_rU9Sdm80",
    url: "https://www.youtube.com/watch?v=Wb_rU9Sdm80",
    note: "provider closeout: description signal, no author comments",
  },
  {
    id: "weak-5",
    bucket: "weak",
    videoId: "NwofrlmaDAc",
    url: "https://www.youtube.com/watch?v=NwofrlmaDAc",
    note: "provider closeout: no description signal, no author comments",
  },
  {
    id: "shorts-weak-1",
    bucket: "shorts_weak",
    videoId: "ehIHFCBZp4E",
    url: "https://www.youtube.com/watch?v=ehIHFCBZp4E",
    note: "provider closeout: description signal, author comment present without recipe signal",
  },
  {
    id: "shorts-weak-2",
    bucket: "shorts_weak",
    videoId: "6Re_tEaAjDQ",
    url: "https://www.youtube.com/watch?v=6Re_tEaAjDQ",
    note: "provider closeout: no description signal, author recipe signal",
  },
  {
    id: "shorts-weak-3",
    bucket: "shorts_weak",
    videoId: "Rjfzpzj3bug",
    url: "https://www.youtube.com/watch?v=Rjfzpzj3bug",
    note: "provider closeout: description signal and author recipe signal",
  },
  {
    id: "shorts-weak-4",
    bucket: "shorts_weak",
    videoId: "FSOj5BPSM-Q",
    url: "https://www.youtube.com/watch?v=FSOj5BPSM-Q",
    note: "provider closeout: no description signal, author recipe signal",
  },
  {
    id: "shorts-weak-5",
    bucket: "shorts_weak",
    videoId: "B6wncU2E12g",
    url: "https://www.youtube.com/watch?v=B6wncU2E12g",
    note: "provider closeout: description signal, author comment present without recipe signal",
  },
  {
    id: "multi-component-1",
    bucket: "multi_component",
    videoId: "j0v1GCA3fxk",
    url: "https://www.youtube.com/watch?v=j0v1GCA3fxk",
    note: "provider closeout: description signal present",
  },
  {
    id: "multi-component-2",
    bucket: "multi_component",
    videoId: "Dc8ybaJMnK4",
    url: "https://www.youtube.com/watch?v=Dc8ybaJMnK4",
    note: "provider closeout: no description signal, no author comments",
  },
  {
    id: "multi-component-3",
    bucket: "multi_component",
    videoId: "VdEbuusFyRI",
    url: "https://www.youtube.com/watch?v=VdEbuusFyRI",
    note: "provider closeout: description signal and author recipe signal",
  },
  {
    id: "multi-component-4",
    bucket: "multi_component",
    videoId: "_VV-51nh_LA",
    url: "https://www.youtube.com/watch?v=_VV-51nh_LA",
    note: "provider closeout: description signal, author comment present without recipe signal",
  },
  {
    id: "multi-component-5",
    bucket: "multi_component",
    videoId: "ex_5qaexoO8",
    url: "https://www.youtube.com/watch?v=ex_5qaexoO8",
    note: "provider closeout: description signal and author recipe signal",
  },
  {
    id: "baking-global-1",
    bucket: "baking_or_global",
    videoId: "_kwOeDDOtww",
    url: "https://www.youtube.com/watch?v=_kwOeDDOtww",
    note: "provider closeout: description signal present",
  },
  {
    id: "baking-global-2",
    bucket: "baking_or_global",
    videoId: "0zcXAJyfZNo",
    url: "https://www.youtube.com/watch?v=0zcXAJyfZNo",
    note: "provider closeout: description signal, author comment present without recipe signal",
  },
  {
    id: "baking-global-3",
    bucket: "baking_or_global",
    videoId: "mOV2mP4DsQs",
    url: "https://www.youtube.com/watch?v=mOV2mP4DsQs",
    note: "provider closeout: description signal present",
  },
  {
    id: "baking-global-4",
    bucket: "baking_or_global",
    videoId: "BRDUvwiXEQA",
    url: "https://www.youtube.com/watch?v=BRDUvwiXEQA",
    note: "provider closeout: description signal, author comment present without recipe signal",
  },
  {
    id: "baking-global-5",
    bucket: "baking_or_global",
    videoId: "nOFkL1cGGjE",
    url: "https://www.youtube.com/watch?v=nOFkL1cGGjE",
    note: "provider closeout: no description signal, author recipe signal",
  },
];

function parseArgs(argv) {
  const args = {
    artifactDir: null,
    baseUrl: null,
    keepServer: false,
    limit: 7,
    fullScreenshots: false,
    noServer: false,
    port: null,
    urls: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--limit" && next) {
      args.limit = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    if (token === "--base-url" && next) {
      args.baseUrl = next;
      args.noServer = true;
      index += 1;
      continue;
    }

    if (token === "--port" && next) {
      args.port = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    if (token === "--artifact-dir" && next) {
      args.artifactDir = next;
      index += 1;
      continue;
    }

    if (token === "--url" && next) {
      args.urls.push(next);
      index += 1;
      continue;
    }

    if (token === "--no-server") {
      args.noServer = true;
      continue;
    }

    if (token === "--keep-server") {
      args.keepServer = true;
      continue;
    }

    if (token === "--full-screenshots") {
      args.fullScreenshots = true;
      continue;
    }

    if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  if (args.limit > SAMPLE_URLS.length) {
    throw new Error(`--limit cannot exceed ${SAMPLE_URLS.length}.`);
  }

  return args;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/youtube-real-app-route-smoke.mjs",
      "  node scripts/youtube-real-app-route-smoke.mjs --limit 9",
      "  node scripts/youtube-real-app-route-smoke.mjs --url https://www.youtube.com/watch?v=lTCplQtiGw8",
      "  node scripts/youtube-real-app-route-smoke.mjs --base-url http://127.0.0.1:3200 --no-server",
      "  node scripts/youtube-real-app-route-smoke.mjs --full-screenshots",
      "",
      "This smoke uses real Supabase Auth, real app routes, real YouTube provider calls,",
      "DB verification through service role, minimal UI count evidence, and cleanup of generated recipes/sessions.",
    ].join("\n") + "\n",
  );
}

function normalizeYoutubeUrlForSmoke(value) {
  const trimmed = value.trim();
  const url = new URL(trimmed);
  const host = url.hostname.replace(/^www\./u, "");
  let videoId = null;

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
      videoId = url.pathname.split("/").filter(Boolean)[1] ?? null;
    }
  } else if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  }

  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error(`Invalid YouTube URL for --url: ${value}`);
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export function buildCustomSample(value, index = 1) {
  const normalized = normalizeYoutubeUrlForSmoke(value);

  return {
    id: `custom-${index}-${normalized.videoId}`,
    bucket: "custom",
    videoId: normalized.videoId,
    url: normalized.url,
    note: "custom smoke input",
  };
}

export function selectSamples(args) {
  const urls = Array.isArray(args.urls) ? args.urls : [];

  if (urls.length > 0) {
    return urls.map((url, index) => buildCustomSample(url, index + 1));
  }

  return SAMPLE_URLS.slice(0, args.limit);
}

async function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const text = await readFile(filePath, "utf8");
  const env = {};

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function mergeEnv(fileEnv) {
  return {
    ...process.env,
    ...fileEnv,
    HOMECOOK_ENABLE_YOUTUBE_IMPORT:
      process.env.HOMECOOK_ENABLE_YOUTUBE_IMPORT ??
      fileEnv.HOMECOOK_ENABLE_YOUTUBE_IMPORT ??
      "1",
    NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT:
      process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT ??
      fileEnv.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT ??
      "1",
    HOMECOOK_ENABLE_QA_FIXTURES: "0",
    NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES: "0",
    HOMECOOK_YOUTUBE_FIXTURE_PROVIDER:
      process.env.HOMECOOK_YOUTUBE_FIXTURE_PROVIDER ??
      fileEnv.HOMECOOK_YOUTUBE_FIXTURE_PROVIDER ??
      "0",
  };
}

function assertLiveSmokeEnvironment(env) {
  if (env.NODE_ENV === "test") {
    throw new Error("Live YouTube smoke cannot run with NODE_ENV=test.");
  }

  if (env.HOMECOOK_YOUTUBE_FIXTURE_PROVIDER !== "0") {
    throw new Error("Live YouTube smoke requires HOMECOOK_YOUTUBE_FIXTURE_PROVIDER=0.");
  }
}

function requireEnv(env, key) {
  const value = env[key];

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + 40; port += 1) {
    if (await isPortOpen(port)) {
      return port;
    }
  }

  throw new Error(`Could not find an open port from ${startPort}.`);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function waitForHttp(url, timeoutMs = 120_000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.status < 500) {
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(1000);
  }

  throw new Error(`Server did not become ready at ${url}: ${lastError?.message ?? "timeout"}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startAppServer({ env, port }) {
  const childEnv = {
    ...env,
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
  };
  const child = spawn(
    "pnpm",
    ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: ROOT,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const tail = [];
  let stopping = false;
  const collect = (chunk) => {
    const text = chunk.toString();
    tail.push(text);
    while (tail.length > 12) {
      tail.shift();
    }
  };

  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  child.once("exit", (code) => {
    if (stopping) {
      return;
    }

    if (code !== null && code !== 0) {
      console.error(`Next dev server exited with code ${code}.`);
      console.error(tail.join(""));
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHttp(baseUrl);

  return {
    baseUrl,
    child,
    stop() {
      if (!child.killed) {
        stopping = true;
        child.kill("SIGTERM");
      }
    },
  };
}

async function ensureSmokeUser(adminClient) {
  let page = 1;
  let existingUser = null;

  while (!existingUser) {
    const result = await adminClient.auth.admin.listUsers({ page, perPage: 200 });

    if (result.error) {
      throw result.error;
    }

    existingUser = result.data.users.find((user) => user.email === TEST_EMAIL) ?? null;

    if (existingUser || result.data.users.length < 200) {
      break;
    }

    page += 1;
  }

  let user = existingUser;

  if (user) {
    const result = await adminClient.auth.admin.updateUserById(user.id, {
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        nickname: "YouTube real smoke",
        provider: "google",
      },
    });

    if (result.error || !result.data.user) {
      throw result.error ?? new Error("Auth user update returned no user.");
    }

    user = result.data.user;
  } else {
    const result = await adminClient.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        nickname: "YouTube real smoke",
        provider: "google",
      },
    });

    if (result.error || !result.data.user) {
      throw result.error ?? new Error("Auth user create returned no user.");
    }

    user = result.data.user;
  }

  const now = new Date().toISOString();
  const publicUserResult = await adminClient
    .from("users")
    .upsert(
      {
        id: user.id,
        nickname: "YouTube real smoke",
        email: TEST_EMAIL,
        profile_image_url: null,
        social_provider: "google",
        social_id: user.id,
        settings_json: {},
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      { onConflict: "id" },
    );

  if (publicUserResult.error) {
    throw publicUserResult.error;
  }

  return user;
}

async function createAuthCookies({ env, baseUrl }) {
  const cookieJar = new Map();
  const client = createServerClient(
    requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return [...cookieJar.entries()].map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            if (cookie.options?.maxAge === 0) {
              cookieJar.delete(cookie.name);
            } else {
              cookieJar.set(cookie.name, cookie.value);
            }
          }
        },
      },
    },
  );

  const signInResult = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signInResult.error || !signInResult.data.user) {
    throw signInResult.error ?? new Error("Supabase Auth sign-in returned no user.");
  }

  const cookies = [...cookieJar.entries()].map(([name, value]) => ({
    name,
    value,
    url: baseUrl,
    sameSite: "Lax",
  }));

  if (cookies.length === 0) {
    throw new Error("Supabase Auth did not produce SSR cookies.");
  }

  return {
    cookies,
    user: signInResult.data.user,
  };
}

async function waitForApiResponse(page, pathPart, action, timeout = 120_000) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (item) => item.url().includes(pathPart) && item.request().method() === "POST",
      { timeout },
    ),
    action(),
  ]);

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    body,
    ok: response.ok(),
    status: response.status(),
  };
}

function sanitizeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-");
}

async function runCase({ adminClient, artifactDir, baseUrl, browser, cookies, sample, startedAtIso, fullScreenshots }) {
  const context = await browser.newContext({
    baseURL: baseUrl,
    locale: "ko-KR",
    viewport: { width: 390, height: 844 },
  });
  await context.addCookies(cookies);

  const page = await context.newPage();
  const result = {
    ...sample,
    cleanup: {
      recipeDeleted: false,
      sessionDeleted: false,
    },
    blocking_issues: [],
    db: null,
    errors: [],
    extract: null,
    extracted_counts: {
      candidates: 0,
      ingredients: 0,
      steps: 0,
    },
    methods: [],
    provider_names: [],
    register: null,
    registerEnabled: false,
    registerRequirements: null,
    reviewReached: false,
    screenshot: null,
    session_ids: [],
    source_providers: [],
    ui_evidence: null,
    ui_evidence_path: null,
    validate: null,
  };

  try {
    await page.goto("/menu/add/youtube", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const urlInput = page.locator('input[type="url"]').first();
    await urlInput.waitFor({ state: "visible", timeout: 30_000 });
    await urlInput.click();
    await urlInput.fill(sample.url);
    await page.waitForFunction(
      (value) => document.querySelector('input[type="url"]')?.value === value,
      sample.url,
      { timeout: 10_000 },
    );

    result.validate = await waitForApiResponse(
      page,
      "/api/v1/recipes/youtube/validate",
      () => page.getByRole("button", { name: "가져오기" }).click(),
      45_000,
    );

    if (!result.validate.ok || result.validate.body?.success === false) {
      result.errors.push(`validate failed: ${result.validate.status}`);
      await captureCaseEvidence(page, artifactDir, sample, result, "validate-failed", { fullScreenshots });
      return result;
    }

    result.extract = await waitForApiResponse(
      page,
      "/api/v1/recipes/youtube/extract",
      () => page.getByRole("button", { name: "레시피 추출하기" }).click(),
      180_000,
    );

    if (!result.extract.ok || result.extract.body?.success === false) {
      result.errors.push(
        `extract failed: ${result.extract.status} ${result.extract.body?.error?.code ?? ""}`.trim(),
      );
      await captureCaseEvidence(page, artifactDir, sample, result, "extract-failed", { fullScreenshots });
      return result;
    }

    result.extractionId = result.extract.body?.data?.extraction_id ?? null;
    result.methods = result.extract.body?.data?.extraction_methods ?? [];
    result.blocking_issues = readStringArray(result.extract.body?.data?.blocking_issues);
    result.extracted_counts = countExtractedData(result.extract.body?.data);

    await Promise.race([
      page.getByTestId("extraction-method-chips").waitFor({ state: "visible", timeout: 30_000 }),
      page.getByText("레시피 추출에 실패했어요").waitFor({ state: "visible", timeout: 30_000 }),
    ]);

    result.reviewReached = await page.getByTestId("extraction-method-chips").isVisible().catch(() => false);

    if (!result.reviewReached) {
      result.errors.push("review screen not reached");
      await captureCaseEvidence(page, artifactDir, sample, result, "review-not-reached", { fullScreenshots });
      return result;
    }

    result.registerRequirements = await page
      .getByTestId("youtube-register-requirements")
      .innerText({ timeout: 1000 })
      .catch(() => null);

    const registerButton = page.getByRole("button", { name: /^등록$/u }).first();
    result.registerEnabled = await registerButton.isEnabled().catch(() => false);
    await captureCaseEvidence(page, artifactDir, sample, result, "review", { fullScreenshots });

    if (result.registerEnabled) {
      result.register = await waitForApiResponse(
        page,
        "/api/v1/recipes/youtube/register",
        () => registerButton.click(),
        90_000,
      );

      if (result.register.ok && result.register.body?.success !== false) {
        result.recipeId = result.register.body?.data?.recipe_id ?? null;
        await page.getByText("레시피가 등록됐어요").waitFor({ state: "visible", timeout: 30_000 });
        await captureCaseEvidence(page, artifactDir, sample, result, "complete", { fullScreenshots });
      } else {
        result.errors.push(
          `register failed: ${result.register.status} ${result.register.body?.error?.code ?? ""}`.trim(),
        );
        await captureCaseEvidence(page, artifactDir, sample, result, "register-failed", { fullScreenshots });
      }
    }

    result.db = await verifyDbState(adminClient, {
      extractionId: result.extractionId,
      recipeId: result.recipeId ?? result.register?.body?.data?.recipe_id ?? null,
      sample,
      startedAtIso,
    });
    finalizeResultProvenance(result);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    await captureCaseEvidence(page, artifactDir, sample, result, "error", { fullScreenshots }).catch(() => {});
  } finally {
    await context.close();
  }

  return result;
}

function readStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
}

function countExtractedData(data) {
  return {
    candidates: Array.isArray(data?.recipe_candidates) ? data.recipe_candidates.length : 0,
    ingredients: Array.isArray(data?.ingredients) ? data.ingredients.length : 0,
    steps: Array.isArray(data?.steps) ? data.steps.length : 0,
  };
}

function parseVisibleCounts(text) {
  const ingredientMatch = text.match(/재료\s*\((\d+)개\)/u);
  const stepMatch = text.match(/만들기\s*\((\d+)단계\)/u);
  const candidateMatch = text.match(/요리\s*후보\s*(\d+)개/u);

  return {
    candidates: candidateMatch ? Number(candidateMatch[1]) : 0,
    ingredients: ingredientMatch ? Number(ingredientMatch[1]) : null,
    steps: stepMatch ? Number(stepMatch[1]) : null,
  };
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/AIza[0-9A-Za-z_-]{20,}/gu, "[REDACTED_API_KEY]")
    .replace(/(api[_-]?key|token|secret|authorization)\s*[:=]\s*\S+/giu, "$1=[REDACTED]")
    .replace(/\s+/gu, " ")
    .trim();
}

function buildUiTextSnippets(text) {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => redactSensitiveText(line))
    .filter(Boolean);
  const keepPatterns = [
    /추출 결과/u,
    /재료\s*\(\d+개\)/u,
    /만들기\s*\(\d+단계\)/u,
    /요리\s*후보\s*\d+개/u,
    /등록하려면/u,
    /찾지 못했어요/u,
    /조리 과정을 직접 입력/u,
  ];

  return lines
    .filter((line) => keepPatterns.some((pattern) => pattern.test(line)))
    .slice(0, 12);
}

async function captureCaseEvidence(page, artifactDir, sample, result, state, options = {}) {
  const bodyText = await page.locator("body").innerText({ timeout: 1000 }).catch(() => "");
  const evidence = {
    captured_at: new Date().toISOString(),
    extraction_counts: result.extracted_counts,
    session_id: result.extractionId ?? null,
    state,
    text_snippets: buildUiTextSnippets(bodyText),
    visible_counts: parseVisibleCounts(bodyText),
  };
  const evidencePath = path.join(
    artifactDir,
    `${sanitizeFileName(sample.id)}-${state}.ui-evidence.json`,
  );
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  result.ui_evidence = evidence;
  result.ui_evidence_path = evidencePath;

  if (options.fullScreenshots || process.env.YOUTUBE_SMOKE_FULL_SCREENSHOTS === "1") {
    const screenshotPath = path.join(
      artifactDir,
      `${sanitizeFileName(sample.id)}-${state}.png`,
    );
    await page.screenshot({ fullPage: false, path: screenshotPath });
    result.screenshot = screenshotPath;
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function collectProviderNamesFromMeta(meta, output = []) {
  if (!meta || typeof meta !== "object") {
    return output;
  }

  for (const [key, value] of Object.entries(meta)) {
    if (key === "source_providers" || key === "provider_names") {
      output.push(...readStringArray(value));
      continue;
    }

    if (/(^|_)provider(_|$)/iu.test(key) && typeof value === "string" && value.trim()) {
      output.push(value.trim());
      continue;
    }

    if (value && typeof value === "object") {
      collectProviderNamesFromMeta(value, output);
    }
  }

  return output;
}

function summarizeProviderMeta(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const allowedKeys = [
    "attempted",
    "cache_hit",
    "confidence",
    "enabled",
    "error_code",
    "model",
    "provider",
    "status",
    "timeout_ms",
    "used",
    "used_fallback",
  ];
  const summary = {};

  for (const key of allowedKeys) {
    const item = value[key];
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      item === null
    ) {
      summary[key] = item;
    }
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

function summarizeExtractionMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return {
      provider_names: [],
      source_providers: [],
      transcript_provider: null,
    };
  }

  const sourceProviders = readStringArray(meta.source_providers);
  const providerNames = uniqueStrings([
    ...sourceProviders,
    ...collectProviderNamesFromMeta(meta),
  ]);
  const summary = {
    provider_names: providerNames,
    source_providers: sourceProviders,
    transcript_provider: typeof meta.transcript_provider === "string" ? meta.transcript_provider : null,
  };

  for (const key of [
    "author_comment",
    "comment_fallback",
    "gemini_structured_extractor",
    "llm_extractor",
    "transcript",
    "visual_quantity_extractor",
    "visual_recipe_extractor",
  ]) {
    const providerSummary = summarizeProviderMeta(meta[key]);
    if (providerSummary) {
      summary[key] = providerSummary;
    }
  }

  return summary;
}

function finalizeResultProvenance(result) {
  const sessionExport = result.db?.sessionExport ?? null;
  const sessionIds = uniqueStrings([
    ...readStringArray(result.session_ids),
    result.extractionId,
    sessionExport?.id,
  ].filter(Boolean));
  const sourceProviders = uniqueStrings([
    ...readStringArray(result.source_providers),
    ...readStringArray(result.db?.sessionSourceProviders),
    ...readStringArray(sessionExport?.source_providers),
    ...readStringArray(sessionExport?.extraction_meta_summary?.source_providers),
  ]);
  const providerNames = uniqueStrings([
    ...readStringArray(result.provider_names),
    ...sourceProviders,
    ...readStringArray(sessionExport?.extraction_meta_summary?.provider_names),
  ]);

  result.session_ids = sessionIds;
  result.source_providers = sourceProviders;
  result.provider_names = providerNames;

  if (result.ui_evidence) {
    result.ui_evidence.extraction_counts = result.extracted_counts;
    result.ui_evidence.session_id = result.extractionId ?? sessionExport?.id ?? null;
  }

  return result;
}

function normalizeResultForReport(result) {
  const rest = { ...result };
  const inputVideoId = rest.videoId;
  delete rest.note;
  delete rest.videoId;
  const normalized = finalizeResultProvenance({
    ...rest,
    blocking_issues: readStringArray(result.blocking_issues),
    errors: readStringArray(result.errors),
    extracted_counts: result.extracted_counts ?? countExtractedData(result.extract?.body?.data),
    input: {
      youtube_url: result.url,
    },
    ui_evidence: result.ui_evidence ? { ...result.ui_evidence } : null,
  });
  const sessionExport = normalized.db?.sessionExport ?? null;

  normalized.title = sessionExport?.title ?? normalized.extract?.body?.data?.title ?? null;
  normalized.youtube_url = sessionExport?.youtube_url ?? normalized.url;
  normalized.youtube_video_id =
    sessionExport?.youtube_video_id ?? normalized.extract?.body?.data?.youtube_video_id ?? null;
  normalized.videoId = normalized.youtube_video_id ?? inputVideoId ?? null;

  return normalized;
}

async function verifyDbState(adminClient, { extractionId, recipeId, sample, startedAtIso }) {
  const db = {
    ingredientCount: 0,
    recipeFound: false,
    recipeSourceFound: false,
    sessionFound: false,
    sessionMethods: [],
    sessionRawSourceHasCaptionTranscript: false,
    sessionRecipeId: null,
    sessionExport: null,
    sessionSourceProviders: [],
    sessionStatus: null,
    sessionTranscriptProvider: null,
    stepCount: 0,
  };

  let resolvedExtractionId = extractionId;

  if (!resolvedExtractionId) {
    const sessionResult = await adminClient
      .from("youtube_extraction_sessions")
      .select("id")
      .eq("youtube_video_id", sample.videoId)
      .gte("created_at", startedAtIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sessionResult.error) {
      resolvedExtractionId = sessionResult.data?.id ?? null;
    }
  }

  if (resolvedExtractionId) {
    const sessionResult = await adminClient
      .from("youtube_extraction_sessions")
      .select("id, status, recipe_id, youtube_url, youtube_video_id, draft_json, extraction_methods, source_providers, extraction_meta_json, raw_source_text")
      .eq("id", resolvedExtractionId)
      .maybeSingle();

    if (sessionResult.error) {
      db.sessionError = sessionResult.error.message;
    } else if (sessionResult.data) {
      db.sessionFound = true;
      db.sessionStatus = sessionResult.data.status;
      db.sessionRecipeId = sessionResult.data.recipe_id;
      db.sessionMethods = sessionResult.data.extraction_methods ?? [];
      db.sessionSourceProviders = sessionResult.data.source_providers ?? [];
      db.sessionTranscriptProvider =
        sessionResult.data.extraction_meta_json?.transcript_provider ?? null;
      db.sessionRawSourceHasCaptionTranscript =
        sessionResult.data.raw_source_text?.includes("--- caption transcript ---") ?? false;
      db.sessionExport = {
        extraction_meta_summary: summarizeExtractionMeta(sessionResult.data.extraction_meta_json),
        extraction_methods: sessionResult.data.extraction_methods ?? [],
        id: sessionResult.data.id,
        recipe_id: sessionResult.data.recipe_id,
        source_providers: sessionResult.data.source_providers ?? [],
        status: sessionResult.data.status,
        title: typeof sessionResult.data.draft_json?.title === "string"
          ? sessionResult.data.draft_json.title
          : null,
        youtube_url: sessionResult.data.youtube_url ?? null,
        youtube_video_id: sessionResult.data.youtube_video_id ?? null,
      };
    }
  }

  const resolvedRecipeId = recipeId ?? db.sessionRecipeId;

  if (resolvedRecipeId) {
    const [recipeResult, sourceResult, ingredientResult, stepResult] = await Promise.all([
      adminClient
        .from("recipes")
        .select("id, title, source_type, created_by")
        .eq("id", resolvedRecipeId)
        .maybeSingle(),
      adminClient
        .from("recipe_sources")
        .select("id, extraction_methods, youtube_extraction_session_id")
        .eq("recipe_id", resolvedRecipeId)
        .maybeSingle(),
      adminClient
        .from("recipe_ingredients")
        .select("id", { count: "exact", head: true })
        .eq("recipe_id", resolvedRecipeId),
      adminClient
        .from("recipe_steps")
        .select("id", { count: "exact", head: true })
        .eq("recipe_id", resolvedRecipeId),
    ]);

    db.recipeFound = Boolean(recipeResult.data);
    db.recipeSourceFound = Boolean(sourceResult.data);
    db.recipeSourceMethods = sourceResult.data?.extraction_methods ?? [];
    db.ingredientCount = ingredientResult.count ?? 0;
    db.stepCount = stepResult.count ?? 0;
    db.recipeError = recipeResult.error?.message ?? null;
    db.sourceError = sourceResult.error?.message ?? null;
    db.ingredientError = ingredientResult.error?.message ?? null;
    db.stepError = stepResult.error?.message ?? null;
  }

  return db;
}

async function cleanupGeneratedRows(adminClient, results) {
  const recipeIds = [
    ...new Set(
      results
        .map((result) => result.recipeId ?? result.db?.sessionRecipeId)
        .filter(Boolean),
    ),
  ];
  const extractionIds = [
    ...new Set(
      results
        .map((result) => result.extractionId)
        .filter(Boolean),
    ),
  ];

  if (recipeIds.length > 0) {
    const deleteRecipes = await adminClient
      .from("recipes")
      .delete()
      .in("id", recipeIds);

    if (deleteRecipes.error) {
      throw deleteRecipes.error;
    }
  }

  if (extractionIds.length > 0) {
    const deleteSessions = await adminClient
      .from("youtube_extraction_sessions")
      .delete()
      .in("id", extractionIds);

    if (deleteSessions.error) {
      throw deleteSessions.error;
    }
  }

  for (const result of results) {
    if (result.recipeId || result.db?.sessionRecipeId) {
      result.cleanup.recipeDeleted = true;
    }
    if (result.extractionId) {
      result.cleanup.sessionDeleted = true;
    }
  }

  const [remainingRecipes, remainingSessions] = await Promise.all([
    countRemainingRows(adminClient, "recipes", recipeIds),
    countRemainingRows(adminClient, "youtube_extraction_sessions", extractionIds),
  ]);

  return {
    extractionIds,
    remainingRecipes,
    remainingSessions,
    recipeIds,
  };
}

async function countRemainingRows(adminClient, tableName, ids) {
  if (ids.length === 0) {
    return 0;
  }

  const result = await adminClient
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .in("id", ids);

  if (result.error) {
    throw result.error;
  }

  return result.count ?? 0;
}

export function summarize(results) {
  return {
    authorCommentUsed: results.filter((result) => result.methods.some(isAuthorCommentMethod)).length,
    cleanedRecipes: results.filter((result) => result.cleanup.recipeDeleted).length,
    cleanedSessions: results.filter((result) => result.cleanup.sessionDeleted).length,
    extractOk: results.filter((result) => result.extract?.ok && result.extract?.body?.success !== false).length,
    registerAttempted: results.filter((result) => result.register).length,
    registerSucceeded: results.filter((result) => result.register?.ok && result.register?.body?.success !== false).length,
    reviewReached: results.filter((result) => result.reviewReached).length,
    total: results.length,
    validateOk: results.filter((result) => result.validate?.ok && result.validate?.body?.success !== false).length,
  };
}

function isAuthorCommentMethod(method) {
  return method === "comment" || method === "author_comment";
}

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

async function writeReports({ artifactDir, baseUrl, cleanup, env, results, runId, startedAtIso, user }) {
  const normalizedResults = results.map(normalizeResultForReport);
  const summary = summarize(normalizedResults);
  const providerNames = uniqueStrings(normalizedResults.flatMap((result) => result.provider_names));
  const sessionIds = uniqueStrings(normalizedResults.flatMap((result) => result.session_ids));
  const jsonReport = {
    artifactDir,
    baseUrl,
    cleanup,
    evidence_origin: "live_provider",
    environment: {
      supabaseProject: new URL(requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0],
      testAccount: TEST_EMAIL,
      testUserIdHash: hashValue(user.id),
    },
    provider_names: providerNames,
    report_schema: REPORT_SCHEMA,
    report_validation: {
      artifact_producer_path: SMOKE_SCRIPT_PATH,
      command: env.YOUTUBE_LIVE_SMOKE_COMMAND ?? "pnpm smoke:youtube-real-app-route",
      environment: {
        homecook_enable_qa_fixtures: env.HOMECOOK_ENABLE_QA_FIXTURES ?? "0",
        homecook_youtube_fixture_provider: env.HOMECOOK_YOUTUBE_FIXTURE_PROVIDER ?? null,
        next_public_homecook_enable_qa_fixtures: env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES ?? "0",
        node_env: env.NODE_ENV ?? "unset",
        youtube_api_key_present: Boolean(env.YOUTUBE_API_KEY),
      },
      evidence_origin: "live_provider",
      extraction_input_policy: "url_only",
      extractor_entrypoint: SMOKE_SCRIPT_PATH,
      extractor_corpus_path: env.YOUTUBE_LIVE_EXTRACTOR_CORPUS_PATH ?? null,
      evaluator_entrypoint: null,
      public_improvement_claim: false,
      run_mode: "live_smoke",
      ui_verifier_entrypoint: UI_VERIFIER_SCRIPT_PATH,
      ui_verified: false,
      verified_live: false,
    },
    results: normalizedResults,
    runId,
    run_mode: "live_smoke",
    session_ids: sessionIds,
    startedAt: startedAtIso,
    summary,
  };

  const jsonPath = path.join(artifactDir, "report.json");
  await writeFile(jsonPath, JSON.stringify(jsonReport, null, 2) + "\n");

  const markdownPath = path.join(
    ROOT,
    "docs",
    "workpacks",
    "29-youtube-author-comment-fallback",
    `real-app-route-smoke-${RUN_DATE}.md`,
  );
  const markdown = buildMarkdownReport({
    artifactDir,
    baseUrl,
    cleanup,
    jsonPath,
    results: normalizedResults,
    runId,
    startedAtIso,
    summary,
  });
  await writeFile(markdownPath, markdown);

  return {
    jsonPath,
    markdownPath,
    summary,
  };
}

function buildMarkdownReport({ artifactDir, baseUrl, cleanup, jsonPath, results, runId, startedAtIso, summary }) {
  const isFinalThirtyUrlMeasurement = summary.total >= 30;
  const lines = [
    `# YouTube Real App-Route Smoke - ${RUN_DATE}`,
    "",
    "## Scope",
    "",
    `- Run id: \`${runId}\``,
    `- Started at: \`${startedAtIso}\``,
    `- App URL: \`${baseUrl}\``,
    "- Mode: `live_smoke` / Playwright Chromium, real Supabase Auth session, real app route calls, real YouTube provider calls",
    "- Auth override/API mocks: not used",
    "- DB verification: Supabase service role",
    "- Cleanup: generated recipe/session rows deleted after verification; persistent test auth account retained",
    "- UI evidence: minimal DOM counts and short snippets only; full screenshots require `--full-screenshots`",
    `- Raw artifact: \`${jsonPath}\``,
    `- Artifact dir: \`${artifactDir}\``,
    "",
    "## Summary",
    "",
    "| Metric | Result |",
    "| --- | ---: |",
    `| URLs attempted | ${summary.total} |`,
    `| validate route ok | ${summary.validateOk}/${summary.total} |`,
    `| extract route ok | ${summary.extractOk}/${summary.total} |`,
    `| review screen reached | ${summary.reviewReached}/${summary.total} |`,
    `| author_comment used | ${summary.authorCommentUsed}/${summary.total} |`,
    `| register attempted | ${summary.registerAttempted}/${summary.total} |`,
    `| register succeeded | ${summary.registerSucceeded}/${summary.total} |`,
    `| cleaned recipes | ${summary.cleanedRecipes} |`,
    `| cleaned sessions | ${summary.cleanedSessions} |`,
    "",
    "## Result Table",
    "",
    "| # | Bucket | Video ID | Methods | Review | Register | DB | Cleanup | Notes |",
    "| ---: | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((result, index) => {
      const methods = result.methods.length > 0 ? result.methods.join(", ") : "-";
      const register = result.register
        ? result.register.ok && result.register.body?.success !== false
          ? "success"
          : `failed:${result.register.body?.error?.code ?? result.register.status}`
        : result.registerEnabled
          ? "not-attempted"
          : "blocked";
      const db = result.db
        ? [
            result.db.sessionFound ? `session:${result.db.sessionStatus}` : "session:-",
            result.db.recipeFound ? "recipe:yes" : "recipe:-",
            `ingredients:${result.db.ingredientCount}`,
            `steps:${result.db.stepCount}`,
          ].join("<br>")
        : "-";
      const cleanupState = [
        result.cleanup.recipeDeleted ? "recipe" : null,
        result.cleanup.sessionDeleted ? "session" : null,
      ].filter(Boolean).join(", ") || "-";
      const notes = [
        result.registerRequirements ? `requirements: ${oneLine(result.registerRequirements)}` : null,
        result.errors.length > 0 ? `errors: ${result.errors.map(oneLine).join("; ")}` : null,
      ].filter(Boolean).join("<br>") || "-";

      return `| ${index + 1} | ${result.bucket} | \`${result.videoId}\` | ${methods} | ${result.reviewReached ? "yes" : "no"} | ${register} | ${db} | ${cleanupState} | ${notes} |`;
    }),
    "",
    "## Cleanup",
    "",
    `- Deleted recipe IDs: ${cleanup.recipeIds.length}`,
    `- Deleted extraction session IDs: ${cleanup.extractionIds.length}`,
    `- Remaining recipe rows after cleanup: ${cleanup.remainingRecipes}`,
    `- Remaining extraction session rows after cleanup: ${cleanup.remainingSessions}`,
    "- The test auth account and public user row were retained for repeatable smoke runs.",
    "",
    "## Limitations",
    "",
    isFinalThirtyUrlMeasurement
      ? "- This is the 30 URL app-route measurement for the balanced provider closeout sample."
      : "- This is a small closeout smoke, not the final 30 URL app-route measurement.",
    "- Register is attempted only when the review UI enables the register action. Blocked drafts are recorded with visible requirements.",
    "- YouTube provider availability and parser output can change over time, so this report is a point-in-time smoke result.",
    "",
  ];

  return lines.join("\n");
}

function oneLine(value) {
  return String(value).replace(/\s+/gu, " ").trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envFile = await readEnvFile(path.join(ROOT, ".env.local"));
  const env = mergeEnv(envFile);
  assertLiveSmokeEnvironment(env);
  const supabaseUrl = requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  requireEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  requireEnv(env, "YOUTUBE_API_KEY");

  const startedAtIso = new Date().toISOString();
  const runId = `youtube-real-app-route-smoke-${RUN_DATE}-${randomUUID().slice(0, 8)}`;
  const artifactDir = path.resolve(
    args.artifactDir ??
      path.join(ROOT, ".artifacts", "youtube-real-app-route-smoke", runId),
  );
  await mkdir(artifactDir, { recursive: true });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const user = await ensureSmokeUser(adminClient);

  let server = null;
  let baseUrl = args.baseUrl;

  if (!baseUrl && !args.noServer) {
    const port = args.port ?? await findOpenPort(DEFAULT_PORT_START);
    process.stdout.write(`Starting app server on port ${port}...\n`);
    server = await startAppServer({ env, port });
    baseUrl = server.baseUrl;
  }

  if (!baseUrl) {
    throw new Error("--base-url is required when --no-server is set.");
  }

  const auth = await createAuthCookies({ env, baseUrl });
  const browser = await chromium.launch({ headless: true });
  const selectedSamples = selectSamples(args);
  const results = [];

  try {
    process.stdout.write(`Running ${selectedSamples.length} real app-route smoke cases...\n`);

    for (const sample of selectedSamples) {
      process.stdout.write(`- ${sample.id} (${sample.videoId})... `);
      const result = await runCase({
        adminClient,
        artifactDir,
        baseUrl,
        browser,
        cookies: auth.cookies,
        fullScreenshots: args.fullScreenshots,
        sample,
        startedAtIso,
      });
      results.push(result);
      const status = result.register?.ok && result.register.body?.success !== false
        ? "registered"
        : result.reviewReached
          ? "review"
          : result.errors.length > 0
            ? "error"
            : "ok";
      process.stdout.write(`${status}\n`);
    }
  } finally {
    await browser.close();
  }

  const cleanup = await cleanupGeneratedRows(adminClient, results);
  const report = await writeReports({
    artifactDir,
    baseUrl,
    cleanup,
    env,
    results,
    runId,
    startedAtIso,
    user,
  });

  process.stdout.write("Smoke summary:\n");
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  process.stdout.write(`Markdown report: ${report.markdownPath}\n`);
  process.stdout.write(`JSON report: ${report.jsonPath}\n`);

  if (server && !args.keepServer) {
    server.stop();
  }
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
