import { describe, expect, it } from "vitest";

import {
  checkWorkpackDocs,
  resolveBaseRef,
  resolveSliceFromBranch,
} from "../scripts/lib/check-workpack-docs.mjs";

describe("resolveSliceFromBranch", () => {
  it("extracts slice from feature/be- branch", () => {
    expect(resolveSliceFromBranch("feature/be-02-discovery-filter")).toBe("02-discovery-filter");
  });

  it("extracts slice from feature/fe- branch", () => {
    expect(resolveSliceFromBranch("feature/fe-03-recipe-like")).toBe("03-recipe-like");
  });

  it("returns null for main branch", () => {
    expect(resolveSliceFromBranch("main")).toBeNull();
  });

  it("returns null for chore branch", () => {
    expect(resolveSliceFromBranch("chore/update-deps")).toBeNull();
  });

  it("returns null for feature branch without be/fe prefix", () => {
    expect(resolveSliceFromBranch("feature/login-gate")).toBeNull();
  });
});

describe("resolveBaseRef", () => {
  it("returns BASE_REF from env if set", () => {
    const spawnSyncFn = () => ({ status: 1, stdout: "" });
    expect(resolveBaseRef({ BASE_REF: "main" }, spawnSyncFn)).toBe("main");
  });

  it("falls back to GITHUB_BASE_REF if BASE_REF not set", () => {
    const spawnSyncFn = () => ({ status: 1, stdout: "" });
    expect(resolveBaseRef({ GITHUB_BASE_REF: "master" }, spawnSyncFn)).toBe("master");
  });

  it("prefers BASE_REF over GITHUB_BASE_REF", () => {
    const spawnSyncFn = () => ({ status: 1, stdout: "" });
    expect(resolveBaseRef({ BASE_REF: "main", GITHUB_BASE_REF: "master" }, spawnSyncFn)).toBe(
      "main",
    );
  });

  it("auto-detects via git when no env vars set", () => {
    const spawnSyncFn = () => ({ status: 0, stdout: "origin/main\n" });
    expect(resolveBaseRef({}, spawnSyncFn)).toBe("main");
  });

  it("strips origin/ prefix from git output", () => {
    const spawnSyncFn = () => ({ status: 0, stdout: "origin/develop\n" });
    expect(resolveBaseRef({}, spawnSyncFn)).toBe("develop");
  });

  it("returns null when git auto-detect fails", () => {
    const spawnSyncFn = () => ({ status: 128, stdout: "" });
    expect(resolveBaseRef({}, spawnSyncFn)).toBeNull();
  });
});

describe("checkWorkpackDocs", () => {
  it("returns empty array when both files exist in base branch", () => {
    const spawnSyncFn = () => ({ status: 0 });
    const missing = checkWorkpackDocs({
      slice: "02-discovery-filter",
      baseRef: "main",
      spawnSyncFn,
    });
    expect(missing).toHaveLength(0);
  });

  it("returns README path when README is missing from base branch", () => {
    const spawnSyncFn = (_cmd: string, args: string[]) => {
      const isReadme = args.some((a) => a.includes("README.md"));
      return { status: isReadme ? 128 : 0 };
    };
    const missing = checkWorkpackDocs({
      slice: "02-discovery-filter",
      baseRef: "main",
      spawnSyncFn,
    });
    expect(missing).toContain("docs/workpacks/02-discovery-filter/README.md");
    expect(missing).not.toContain("docs/workpacks/02-discovery-filter/acceptance.md");
  });

  it("returns acceptance path when acceptance.md is missing from base branch", () => {
    const spawnSyncFn = (_cmd: string, args: string[]) => {
      const isAcceptance = args.some((a) => a.includes("acceptance.md"));
      return { status: isAcceptance ? 128 : 0 };
    };
    const missing = checkWorkpackDocs({
      slice: "02-discovery-filter",
      baseRef: "main",
      spawnSyncFn,
    });
    expect(missing).toContain("docs/workpacks/02-discovery-filter/acceptance.md");
    expect(missing).not.toContain("docs/workpacks/02-discovery-filter/README.md");
  });

  it("returns both paths when both files are missing", () => {
    const spawnSyncFn = () => ({ status: 128 });
    const missing = checkWorkpackDocs({
      slice: "02-discovery-filter",
      baseRef: "main",
      spawnSyncFn,
    });
    expect(missing).toContain("docs/workpacks/02-discovery-filter/README.md");
    expect(missing).toContain("docs/workpacks/02-discovery-filter/acceptance.md");
  });

  it("uses the correct git show command with origin/<baseRef>:path", () => {
    const calls: string[][] = [];
    const spawnSyncFn = (_cmd: string, args: string[]) => {
      calls.push(args);
      return { status: 0 };
    };
    checkWorkpackDocs({ slice: "03-recipe-like", baseRef: "master", spawnSyncFn });
    expect(calls[0]).toContain("origin/master:docs/workpacks/03-recipe-like/README.md");
    expect(calls[1]).toContain("origin/master:docs/workpacks/03-recipe-like/acceptance.md");
  });
});
