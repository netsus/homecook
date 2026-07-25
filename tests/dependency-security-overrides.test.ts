import { readFileSync } from "node:fs";
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

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(join(rootDir, relativePath), "utf8")) as {
    pnpm?: {
      overrides?: Record<string, string>;
      patchedDependencies?: Record<string, string>;
    };
    version?: string;
  };
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
    const packageJson = readJson("package.json");

    expect(packageJson.pnpm?.overrides).toMatchObject({
      "minimatch@3.1.5>brace-expansion": "5.0.8",
      "minimatch@10.2.5>brace-expansion": "5.0.8",
      postcss: "8.5.18",
    });
    expect(packageJson.pnpm?.patchedDependencies).toEqual({
      "minimatch@3.1.5": "patches/minimatch@3.1.5.patch",
    });
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
