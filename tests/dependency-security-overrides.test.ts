import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const rootDir = process.cwd();

type MinimatchV3 = (value: string, pattern: string) => boolean;
type MinimatchV10 = {
  minimatch: MinimatchV3;
};
type Postcss = (
  plugins: unknown[],
) => {
  process: (
    css: string,
    options: { from: undefined },
  ) => {
    css: string;
  };
};

function readPnpmConfig(name: string) {
  const result = spawnSync("pnpm", ["config", "get", name, "--json"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  const output = result.stdout.trim();
  return output
    ? JSON.parse(output) as Record<string, string | boolean> | string[]
    : null;
}

function createDependencyRequire(packageName: string) {
  return createRequire(require.resolve(packageName));
}

function resolveTypescriptEstreeRequire() {
  const nextConfigRequire = createDependencyRequire("eslint-config-next");
  const eslintPluginRequire = createRequire(
    nextConfigRequire.resolve("@typescript-eslint/eslint-plugin"),
  );
  const typeUtilsRequire = createRequire(
    eslintPluginRequire.resolve("@typescript-eslint/type-utils"),
  );

  return createRequire(
    typeUtilsRequire.resolve("@typescript-eslint/typescript-estree"),
  );
}

describe("dependency security overrides", () => {
  it("keeps the audited versions and minimatch compatibility patch declared", () => {
    const overrides = readPnpmConfig("overrides");
    const patchedDependencies = readPnpmConfig("patchedDependencies");
    const allowBuilds =
      readPnpmConfig("allowBuilds")
      ?? readPnpmConfig("onlyBuiltDependencies");

    expect(overrides).toMatchObject({
      "minimatch@3.1.5>brace-expansion": "5.0.8",
      "minimatch@10.2.5>brace-expansion": "5.0.8",
      postcss: "8.5.18",
    });
    expect(patchedDependencies).toEqual({
      "minimatch@3.1.5": join(rootDir, "patches/minimatch@3.1.5.patch"),
    });
    if (Array.isArray(allowBuilds)) {
      expect(allowBuilds).toEqual([
        "esbuild@0.28.1",
        "unrs-resolver@1.11.1",
      ]);
    } else {
      expect(allowBuilds).toEqual({
        "esbuild@0.28.1": true,
        "unrs-resolver@1.11.1": true,
      });
    }
  });

  it("expands braces through both installed minimatch major versions", () => {
    const eslintRequire = createDependencyRequire("@eslint/eslintrc");
    const typescriptEstreeRequire = resolveTypescriptEstreeRequire();
    const minimatch3 = eslintRequire("minimatch") as MinimatchV3;
    const minimatch10 = typescriptEstreeRequire("minimatch") as MinimatchV10;

    expect(minimatch3("src/app.ts", "src/**/*.{ts,tsx}")).toBe(true);
    expect(minimatch3("docs/a.md", "{src,tests}/**/*.ts")).toBe(false);
    expect(minimatch10.minimatch("src/app.ts", "src/**/*.{ts,tsx}")).toBe(true);
    expect(
      minimatch10.minimatch("tests/a.test.ts", "{src,tests}/**/*.ts"),
    ).toBe(true);
  });

  it("loads the patched PostCSS version and transforms CSS", () => {
    const tailwindPostcssRequire = createDependencyRequire(
      "@tailwindcss/postcss",
    );
    const postcss = tailwindPostcssRequire("postcss") as Postcss;
    const postcssPackage = tailwindPostcssRequire(
      "postcss/package.json",
    ) as { version: string };

    expect(postcssPackage.version).toBe("8.5.18");
    expect(postcss([]).process("a{color:red}", { from: undefined }).css).toBe(
      "a{color:red}",
    );
  });
});
