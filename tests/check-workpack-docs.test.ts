import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  checkWorkpackDocs,
  ensureRemoteBaseRef,
  resolveBaseRef,
  resolveSliceFromBranch,
  resolveWorkpackSlice,
} from "../scripts/lib/check-workpack-docs.mjs";

describe("ensureRemoteBaseRef", () => {
  it("fetches a shallow pull-request base when checkout did not create its remote ref", () => {
    const calls: string[][] = [];
    const spawnSyncFn = (_cmd: string, args: string[]) => {
      calls.push(args);
      return args[0] === "rev-parse"
        ? { status: 1 }
        : { status: 0 };
    };

    expect(ensureRemoteBaseRef("master", spawnSyncFn)).toBe(true);
    expect(calls).toEqual([
      ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/master"],
      [
        "fetch",
        "--no-tags",
        "--depth=1",
        "origin",
        "+refs/heads/master:refs/remotes/origin/master",
      ],
    ]);
  });

  it("fails closed when the pull-request base cannot be fetched", () => {
    const spawnSyncFn = () => ({ status: 1 });
    expect(ensureRemoteBaseRef("master", spawnSyncFn)).toBe(false);
  });
});

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

describe("resolveWorkpackSlice", () => {
  it("maps an implementation branch through the workflow-v2 work item", () => {
    const spawnSyncFn = (_cmd: string, args: string[]) =>
      args.includes("HEAD:.workflow-v2/status.json")
        ? {
            status: 0,
            stdout: JSON.stringify({
              items: [
                {
                  id: "product-ingredient-link-foundation",
                  branch: "feature/be-product-ingredient-link-contract-runtime",
                },
              ],
            }),
          }
        : { status: 0, stdout: "" };
    expect(
      resolveWorkpackSlice({
        slice: "product-ingredient-link-contract-runtime",
        baseRef: "master",
        spawnSyncFn,
      }),
    ).toBe("product-ingredient-link-foundation");
  });

  it("keeps normal slice names unchanged", () => {
    const spawnSyncFn = () => ({ status: 0, stdout: "" });
    expect(
      resolveWorkpackSlice({
        slice: "02-discovery-filter",
        baseRef: "master",
        spawnSyncFn,
      }),
    ).toBe("02-discovery-filter");
  });

  it("maps retrofit branches to the matching workpack folder by numeric prefix", () => {
    const spawnSyncFn = () => ({
      status: 0,
      stdout: [
        "docs/workpacks/01-discovery-detail-auth/README.md",
        "docs/workpacks/01-discovery-detail-auth/acceptance.md",
        "docs/workpacks/02-discovery-filter/README.md",
      ].join("\n"),
    });

    expect(
      resolveWorkpackSlice({
        slice: "01-retrofit",
        baseRef: "master",
        spawnSyncFn,
      }),
    ).toBe("01-discovery-detail-auth");
  });

  it("falls back to the retrofit name when the numeric prefix is ambiguous", () => {
    const spawnSyncFn = () => ({
      status: 0,
      stdout: [
        "docs/workpacks/01-discovery-detail-auth/README.md",
        "docs/workpacks/01-other-slice/README.md",
      ].join("\n"),
    });

    expect(
      resolveWorkpackSlice({
        slice: "01-retrofit",
        baseRef: "master",
        spawnSyncFn,
      }),
    ).toBe("01-retrofit");
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
    expect(calls[1]).toContain("origin/master:docs/workpacks/03-recipe-like/README.md");
    expect(calls[2]).toContain("origin/master:docs/workpacks/03-recipe-like/acceptance.md");
  });

  it("uses the mapped workpack folder for retrofit branches", () => {
    const calls: string[][] = [];
    const spawnSyncFn = (_cmd: string, args: string[]) => {
      calls.push(args);

      if (args[0] === "ls-tree") {
        return {
          status: 0,
          stdout: [
            "docs/workpacks/01-discovery-detail-auth/README.md",
            "docs/workpacks/01-discovery-detail-auth/acceptance.md",
          ].join("\n"),
        };
      }

      return { status: 0 };
    };

    checkWorkpackDocs({ slice: "01-retrofit", baseRef: "master", spawnSyncFn });

    expect(calls[2]).toContain(
      "origin/master:docs/workpacks/01-discovery-detail-auth/README.md",
    );
    expect(calls[3]).toContain(
      "origin/master:docs/workpacks/01-discovery-detail-auth/acceptance.md",
    );
  });
});

describe("check-workpack-docs CLI", () => {
  function runValidateWorkpack(args: string[], branchName = "") {
    return spawnSync("pnpm", ["validate:workpack", "--", ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        BASE_REF: "master",
        BRANCH_NAME: branchName,
      },
    });
  }

  it("executes explicit slice validation independently of branch state", () => {
    const result = runValidateWorkpack([
      "--slice",
      "cooked-batch-weight-ledger",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Workpack docs OK for slice 'cooked-batch-weight-ledger' (base: master)",
    );
  });

  it("fails closed when an explicit slice has no governing workpack", () => {
    const result = runValidateWorkpack(["--slice", "unknown-workpack"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Workpack docs not found in origin/master for slice 'unknown-workpack'",
    );
  });

  it("fails closed when --slice has no value", () => {
    const result = runValidateWorkpack(["--slice"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--slice requires a value");
  });

  it("preserves branch-based validation when no explicit slice is supplied", () => {
    const result = runValidateWorkpack(
      [],
      "feature/be-cooked-batch-weight-ledger",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Workpack docs OK for slice 'cooked-batch-weight-ledger' (base: master)",
    );
  });
});
