import { chmodSync, mkdtempSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildProductionBrowserAdapterWrapperSource,
  installProductionBrowserAdapterWrapper,
} from "../scripts/install-full-local-session-production-browser-adapter.mjs";

describe("production browser adapter installer", () => {
  it("is exposed through the canonical package script", () => {
    const packageJson = JSON.parse(readFileSync(
      path.join(process.cwd(), "package.json"),
      "utf8",
    ));

    expect(packageJson.scripts["install:full-local-session-production-browser-adapter"])
      .toBe("node scripts/install-full-local-session-production-browser-adapter.mjs");
  });

  it("writes an importable standalone wrapper into a 0700 directory with a 0600 file", async () => {
    const outsideRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "browser-canary-wrapper-")));
    const adapterPath = path.join(outsideRoot, "operator-canary", "session-canary-adapter.mjs");

    const result = installProductionBrowserAdapterWrapper({
      outputPath: adapterPath,
      repoRoot: process.cwd(),
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
    expect(wrapper).not.toContain(`${process.cwd()}/scripts/lib/full-local-session-production-browser-adapter.mjs`);
    expect(wrapper).toContain("file://");
    expect(wrapper).not.toContain('from "@supabase/ssr"');
    expect(wrapper).not.toContain('import("@playwright/test")');
    expect(wrapper).not.toContain("TODO");
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

    chmodSync(outsideRoot, 0o700);
    installProductionBrowserAdapterWrapper({
      outputPath: adapterPath,
      repoRoot: process.cwd(),
    });
    const before = readFileSync(adapterPath, "utf8");

    expect(() => installProductionBrowserAdapterWrapper({
      outputPath: adapterPath,
      repoRoot: process.cwd(),
    })).toThrow(/already exists|overwrite/u);
    expect(readFileSync(adapterPath, "utf8")).toBe(before);
  });

  it("builds a reviewable wrapper source with explicit gap notes only", () => {
    const source = buildProductionBrowserAdapterWrapperSource({
      adapterModulePath: path.join(
        process.cwd(),
        "scripts/lib/full-local-session-production-browser-adapter.mjs",
      ),
    });

    expect(source).toContain("export async function createProductionBrowserCanaryAdapter");
    expect(source).not.toContain("scripts/lib/full-local-session-production-browser-adapter.mjs");
    expect(source).not.toContain('from "@supabase/ssr"');
    expect(source).not.toContain('import("@playwright/test")');
    expect(source).not.toContain("since-deploy observation counter reader");
    expect(source).not.toContain("readSessionBinding");
    expect(source).not.toContain("requestSessionRefresh");
    expect(source).not.toMatch(/access_token|refresh_token|cookie=|@gmail\.com/iu);
  });
});
