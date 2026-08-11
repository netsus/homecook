import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildProductionBrowserAdapterWrapperSource,
  installProductionBrowserAdapterWrapper,
} from "../scripts/install-full-local-session-production-browser-adapter.mjs";

const FALLBACK_PUBLIC_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.public-anon-key-signing-material.signature";
const PUBLISHABLE_PUBLIC_ANON_KEY =
  "sb_publishable_0123456789ABCD-EFGHIJKLMNOPQRSTUVWXYZabcdef";

describe("production browser adapter installer", () => {
  it("is exposed through the canonical package script", () => {
    const packageJson = JSON.parse(readFileSync(
      path.join(process.cwd(), "package.json"),
      "utf8",
    ));

    expect(packageJson.scripts["install:full-local-session-production-browser-adapter"])
      .toBe("node scripts/install-full-local-session-production-browser-adapter.mjs");
  });

  it("writes an importable standalone wrapper into a 0700 directory with a 0600 file and embeds only the publishable anon key fallback", async () => {
    const outsideRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "browser-canary-wrapper-")));
    const adapterPath = path.join(outsideRoot, "operator-canary", "session-canary-adapter.mjs");
    const repoRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "browser-canary-repo-")));
    mkdirSync(path.join(repoRoot, "scripts/lib"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, "scripts/lib/full-local-session-production-browser-adapter.mjs"),
      readFileSync(path.join(process.cwd(), "scripts/lib/full-local-session-production-browser-adapter.mjs"), "utf8"),
      "utf8",
    );
    writeFileSync(
      path.join(repoRoot, ".env.production.local"),
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${PUBLISHABLE_PUBLIC_ANON_KEY}\nSUPABASE_SERVICE_ROLE_KEY=must-not-leak\n`,
      "utf8",
    );

    const result = installProductionBrowserAdapterWrapper({
      outputPath: adapterPath,
      repoRoot,
    });

    expect(result).toEqual({
      adapterPath,
      adapterPathMode: "0600",
      manualUserAction: expect.any(String),
      operatorDirectory: path.join(outsideRoot, "operator-canary"),
      operatorDirectoryMode: "0700",
      unresolvedGaps: [],
    });

    const wrapper = readFileSync(adapterPath, "utf8");
    expect(wrapper).toContain("createProductionBrowserCanaryAdapter");
    expect(wrapper).not.toContain(`${repoRoot}/scripts/lib/full-local-session-production-browser-adapter.mjs`);
    expect(wrapper).toContain("file://");
    expect(wrapper).not.toContain('from "@supabase/ssr"');
    expect(wrapper).not.toContain('import("@playwright/test")');
    expect(wrapper).not.toContain("TODO");
    expect(wrapper).toContain(`const CONFIGURED_PUBLIC_ANON_KEY = ${JSON.stringify(PUBLISHABLE_PUBLIC_ANON_KEY)};`);
    expect(wrapper).toContain("configuredPublicAnonKey: CONFIGURED_PUBLIC_ANON_KEY");
    expect(wrapper).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(JSON.stringify(result)).not.toContain(PUBLISHABLE_PUBLIC_ANON_KEY);
    expect(wrapper).toContain("https://app.mumeok.kr/login?next=%2Fplanner");
    expect(wrapper).toContain("/auth/callback");
    expect(wrapper).not.toContain("/auth/link/callback");
    expect(wrapper).toContain("/planner");
    expect(wrapper).not.toMatch(/keychain|magic.?link|service_role/i);
    const installedModule = await import(pathToFileURL(adapterPath).href);
    expect(installedModule.createProductionCanaryAdapter).toBeTypeOf("function");
  });

  it("rejects repo-internal paths, aliases, and non-private parents", () => {
    const insideRepo = path.join(process.cwd(), "scripts", "session-canary-adapter.mjs");
    expect(() => installProductionBrowserAdapterWrapper({
      outputPath: insideRepo,
      repoRoot: process.cwd(),
    })).toThrow(/outside the repository/u);

    const realParent = realpathSync(mkdtempSync(path.join(tmpdir(), "browser-canary-real-")));
    const aliasRoot = mkdtempSync(path.join(tmpdir(), "browser-canary-alias-"));
    const aliasParent = path.join(aliasRoot, "linked");
    symlinkSync(realParent, aliasParent, "dir");
    expect(() => installProductionBrowserAdapterWrapper({
      outputPath: path.join(aliasParent, "session-canary-adapter.mjs"),
      repoRoot: process.cwd(),
    })).toThrow(/canonical|symbolic/u);

    const wideParent = realpathSync(mkdtempSync(path.join(tmpdir(), "browser-canary-wide-")));
    chmodSync(wideParent, 0o755);
    expect(() => installProductionBrowserAdapterWrapper({
      outputPath: path.join(wideParent, "session-canary-adapter.mjs"),
      repoRoot: process.cwd(),
    })).toThrow(/0700/u);
  });

  it("fails closed without overwriting an existing target file", () => {
    const outsideRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "browser-canary-existing-")));
    const operatorDirectory = path.join(outsideRoot, "operator-canary");
    const adapterPath = path.join(operatorDirectory, "session-canary-adapter.mjs");
    const repoRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "browser-canary-existing-repo-")));
    mkdirSync(path.join(repoRoot, "scripts/lib"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, "scripts/lib/full-local-session-production-browser-adapter.mjs"),
      readFileSync(path.join(process.cwd(), "scripts/lib/full-local-session-production-browser-adapter.mjs"), "utf8"),
      "utf8",
    );
    writeFileSync(
      path.join(repoRoot, ".env.production.local"),
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${FALLBACK_PUBLIC_ANON_KEY}\n`,
      "utf8",
    );

    chmodSync(outsideRoot, 0o700);
    installProductionBrowserAdapterWrapper({
      outputPath: adapterPath,
      repoRoot,
    });
    const before = readFileSync(adapterPath, "utf8");

    expect(() => installProductionBrowserAdapterWrapper({
      outputPath: adapterPath,
      repoRoot,
    })).toThrow(/already exists|overwrite/u);
    expect(readFileSync(adapterPath, "utf8")).toBe(before);
  });

  it("fails closed when the exact anon key is missing or invalid", () => {
    const outsideRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "browser-canary-invalid-")));
    const adapterPath = path.join(outsideRoot, "operator-canary", "session-canary-adapter.mjs");
    const repoRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "browser-canary-invalid-repo-")));
    mkdirSync(path.join(repoRoot, "scripts/lib"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, "scripts/lib/full-local-session-production-browser-adapter.mjs"),
      readFileSync(path.join(process.cwd(), "scripts/lib/full-local-session-production-browser-adapter.mjs"), "utf8"),
      "utf8",
    );

    writeFileSync(path.join(repoRoot, ".env.production.local"), "SUPABASE_SERVICE_ROLE_KEY=must-not-leak\n", "utf8");
    expect(() => installProductionBrowserAdapterWrapper({
      outputPath: adapterPath,
      repoRoot,
    })).toThrow(/anon key/i);

    writeFileSync(path.join(repoRoot, ".env.production.local"), "NEXT_PUBLIC_SUPABASE_ANON_KEY=short\n", "utf8");
    expect(() => installProductionBrowserAdapterWrapper({
      outputPath: adapterPath,
      repoRoot,
    })).toThrow(/anon key/i);

    writeFileSync(
      path.join(repoRoot, ".env.production.local"),
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_secret_live_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\n",
      "utf8",
    );
    expect(() => installProductionBrowserAdapterWrapper({
      outputPath: adapterPath,
      repoRoot,
    })).toThrow(/anon key/i);

    writeFileSync(
      path.join(repoRoot, ".env.production.local"),
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_anything_else_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\n",
      "utf8",
    );
    expect(() => installProductionBrowserAdapterWrapper({
      outputPath: adapterPath,
      repoRoot,
    })).toThrow(/anon key/i);
  });

  it("builds a reviewable wrapper source with explicit gap notes only", () => {
    const source = buildProductionBrowserAdapterWrapperSource({
      adapterModulePath: path.join(
        process.cwd(),
        "scripts/lib/full-local-session-production-browser-adapter.mjs",
      ),
      configuredPublicAnonKey: FALLBACK_PUBLIC_ANON_KEY,
    });

    expect(source).toContain("export async function createProductionBrowserCanaryAdapter");
    expect(source).toContain(`const CONFIGURED_PUBLIC_ANON_KEY = ${JSON.stringify(FALLBACK_PUBLIC_ANON_KEY)};`);
    expect(source).not.toContain("scripts/lib/full-local-session-production-browser-adapter.mjs");
    expect(source).not.toContain('from "@supabase/ssr"');
    expect(source).not.toContain('import("@playwright/test")');
    expect(source).not.toContain("since-deploy observation counter reader");
    expect(source).not.toContain("readSessionBinding");
    expect(source).not.toContain("requestSessionRefresh");
    expect(source).not.toMatch(/access_token|refresh_token|cookie=|@gmail\.com/iu);
  });

  it("fails closed when the wrapper builder receives an omitted or undefined anon key", () => {
    expect(() => buildProductionBrowserAdapterWrapperSource({
      adapterModulePath: path.join(
        process.cwd(),
        "scripts/lib/full-local-session-production-browser-adapter.mjs",
      ),
      configuredPublicAnonKey: undefined,
    })).toThrow(/anon key/i);
  });
});
