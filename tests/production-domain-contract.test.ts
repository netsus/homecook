import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectProductionDomainContractTargets,
  PRODUCTION_DOMAIN_TUPLE,
  validateProductionDomainContract,
} from "../scripts/validate-production-domain-contract.mjs";

const legacyDomain = "mumeok" + ".com";
const legacyAppCallback = `https://app.${legacyDomain}/auth/callback`;
const legacyAuthIssuer = `https://auth.${legacyDomain}/auth/v1`;

function write(rootDir: string, relativePath: string, contents: string) {
  const absolutePath = join(rootDir, relativePath);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, contents, "utf8");
}

function createFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "production-domain-contract-"));
  write(
    rootDir,
    "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
    [
      "# Current Source of Truth",
      "",
      "## Official Files",
      "- `docs/요구사항기준선-v1.7.30.md`",
      "- `docs/화면정의서-v1.5.34.md`",
      "- `docs/유저flow맵-v1.3.32.md`",
      "- `docs/db설계-v1.3.32.md`",
      "- `docs/api문서-v1.2.37.md`",
      "",
      `> production 단일 origin은 ${PRODUCTION_DOMAIN_TUPLE.appOrigin}와 ${PRODUCTION_DOMAIN_TUPLE.authOrigin}다.`,
      "> callback은 /auth/callback, /auth/link/callback 두 기존 경로만 사용한다.",
      "",
    ].join("\n"),
  );
  for (const relativePath of [
    "docs/요구사항기준선-v1.7.30.md",
    "docs/화면정의서-v1.5.34.md",
    "docs/유저flow맵-v1.3.32.md",
    "docs/db설계-v1.3.32.md",
    "docs/api문서-v1.2.37.md",
  ]) {
    write(rootDir, relativePath, "# official\n");
  }
  write(
    rootDir,
    "docs/workpacks/full-local-supabase-production/README.md",
    [
      `app ${PRODUCTION_DOMAIN_TUPLE.appOrigin}`,
      `auth ${PRODUCTION_DOMAIN_TUPLE.authOrigin}`,
      `callback ${PRODUCTION_DOMAIN_TUPLE.callback}`,
      `link ${PRODUCTION_DOMAIN_TUPLE.linkCallback}`,
    ].join("\n"),
  );
  write(
    rootDir,
    "docs/workpacks/full-local-supabase-production/acceptance.md",
    [
      "# acceptance",
      `app ${PRODUCTION_DOMAIN_TUPLE.appOrigin}`,
      `auth ${PRODUCTION_DOMAIN_TUPLE.authOrigin}`,
      `callback ${PRODUCTION_DOMAIN_TUPLE.callback}`,
      `link ${PRODUCTION_DOMAIN_TUPLE.linkCallback}`,
    ].join("\n"),
  );
  write(rootDir, "docs/engineering/full-local-supabase-production-plan.html", "<p>active contract</p>\n");
  write(
    rootDir,
    "infra/full-local-supabase/.env.production.example",
    [
      `FULL_LOCAL_ADDITIONAL_REDIRECT_URLS=${PRODUCTION_DOMAIN_TUPLE.callback},${PRODUCTION_DOMAIN_TUPLE.linkCallback}`,
      `FULL_LOCAL_API_EXTERNAL_URL=${PRODUCTION_DOMAIN_TUPLE.authOrigin}/auth/v1`,
      `FULL_LOCAL_PUBLIC_AUTH_URL=${PRODUCTION_DOMAIN_TUPLE.authOrigin}`,
      `FULL_LOCAL_SITE_URL=${PRODUCTION_DOMAIN_TUPLE.appOrigin}`,
    ].join("\n"),
  );
  write(rootDir, "infra/full-local-supabase/docker-compose.production.yml", "services: {}\n");
  write(rootDir, "tests/example.test.ts", `const issuer = "${PRODUCTION_DOMAIN_TUPLE.authOrigin}/auth/v1";\n`);
  return rootDir;
}

describe("production domain contract validator", () => {
  it("passes on the current repository and exposes the package verify script", async () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const [result] = validateProductionDomainContract({ rootDir: process.cwd() });

    expect(packageJson.scripts?.["verify:production-domain-contract"]).toBe(
      "node scripts/validate-production-domain-contract.mjs",
    );
    expect(result.errors).toEqual([]);
  });

  it("includes tracked shell files in the active scan set", () => {
    const { files } = collectProductionDomainContractTargets({ rootDir: process.cwd() });

    expect(files).toContain("infra/full-local-supabase/secret-entrypoint.sh");
  });

  it("fails closed when an official file listed in CURRENT_SOURCE_OF_TRUTH is missing", () => {
    const rootDir = createFixtureRoot();
    rmSync(join(rootDir, "docs/api문서-v1.2.37.md"));

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_OFFICIAL_FILE",
          path: "docs/api문서-v1.2.37.md",
        }),
      ]),
    );
  });

  it("fails closed when a required workpack file is missing", () => {
    const rootDir = createFixtureRoot();
    rmSync(join(rootDir, "docs/workpacks/full-local-supabase-production/README.md"));

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_ACTIVE_SCAN_FILE",
          path: "docs/workpacks/full-local-supabase-production/README.md",
        }),
      ]),
    );
  });

  it("fails when an official document keeps an active .com production reference", () => {
    const rootDir = createFixtureRoot();
    write(rootDir, "docs/api문서-v1.2.37.md", `callback ${legacyAppCallback}\n`);

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "docs/api문서-v1.2.37.md:1",
          message: expect.stringContaining(legacyDomain),
        }),
      ]),
    );
  });

  it("rejects CURRENT_SOURCE_OF_TRUTH official paths that escape the repository with .. segments", () => {
    const rootDir = createFixtureRoot();
    const outsideDir = mkdtempSync(join(tmpdir(), "production-domain-contract-outside-"));
    const escapedPath = join(outsideDir, "escaped.md");
    writeFileSync(escapedPath, `secret ${legacyAppCallback}\n`, "utf8");
    write(
      rootDir,
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      [
        "# Current Source of Truth",
        "",
        "## Official Files",
        "- `../escaped.md`",
        "- `docs/화면정의서-v1.5.34.md`",
        "- `docs/유저flow맵-v1.3.32.md`",
        "- `docs/db설계-v1.3.32.md`",
        "- `docs/api문서-v1.2.37.md`",
        "",
        `> production 단일 origin은 ${PRODUCTION_DOMAIN_TUPLE.appOrigin}와 ${PRODUCTION_DOMAIN_TUPLE.authOrigin}다.`,
        "> callback은 /auth/callback, /auth/link/callback 두 기존 경로만 사용한다.",
      ].join("\n"),
    );

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.files).not.toContain("../escaped.md");
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_OFFICIAL_PATH",
          path: "../escaped.md",
        }),
      ]),
    );
    expect(result.errors.some((error) => error.message.includes(legacyDomain))).toBe(false);
  });

  it("rejects CURRENT_SOURCE_OF_TRUTH official paths that are absolute paths", () => {
    const rootDir = createFixtureRoot();
    const outsideDir = mkdtempSync(join(tmpdir(), "production-domain-contract-absolute-"));
    const absolutePath = join(outsideDir, "absolute.md");
    writeFileSync(absolutePath, `secret ${legacyAuthIssuer}\n`, "utf8");
    write(
      rootDir,
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      [
        "# Current Source of Truth",
        "",
        "## Official Files",
        `- \`${absolutePath}\``,
        "- `docs/화면정의서-v1.5.34.md`",
        "- `docs/유저flow맵-v1.3.32.md`",
        "- `docs/db설계-v1.3.32.md`",
        "- `docs/api문서-v1.2.37.md`",
        "",
        `> production 단일 origin은 ${PRODUCTION_DOMAIN_TUPLE.appOrigin}와 ${PRODUCTION_DOMAIN_TUPLE.authOrigin}다.`,
        "> callback은 /auth/callback, /auth/link/callback 두 기존 경로만 사용한다.",
      ].join("\n"),
    );

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.files).not.toContain(absolutePath);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_OFFICIAL_PATH",
          path: absolutePath,
        }),
      ]),
    );
    expect(result.errors.some((error) => error.message.includes(legacyDomain))).toBe(false);
  });

  it("rejects CURRENT_SOURCE_OF_TRUTH official paths whose symlink escapes the repository", () => {
    const rootDir = createFixtureRoot();
    const outsideDir = mkdtempSync(join(tmpdir(), "production-domain-contract-symlink-"));
    const leakedTarget = join(outsideDir, "secret.md");
    writeFileSync(leakedTarget, `secret ${legacyAppCallback}\n`, "utf8");
    symlinkSync(leakedTarget, join(rootDir, "docs/leaked-official.md"));
    write(
      rootDir,
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      [
        "# Current Source of Truth",
        "",
        "## Official Files",
        "- `docs/leaked-official.md`",
        "- `docs/화면정의서-v1.5.34.md`",
        "- `docs/유저flow맵-v1.3.32.md`",
        "- `docs/db설계-v1.3.32.md`",
        "- `docs/api문서-v1.2.37.md`",
        "",
        `> production 단일 origin은 ${PRODUCTION_DOMAIN_TUPLE.appOrigin}와 ${PRODUCTION_DOMAIN_TUPLE.authOrigin}다.`,
        "> callback은 /auth/callback, /auth/link/callback 두 기존 경로만 사용한다.",
      ].join("\n"),
    );

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.files).not.toContain("docs/leaked-official.md");
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_OFFICIAL_PATH",
          path: "docs/leaked-official.md",
        }),
      ]),
    );
    expect(result.errors.some((error) => error.message.includes(legacyDomain))).toBe(false);
  });

  it("rejects a symlinked CURRENT_SOURCE_OF_TRUTH file that escapes the repository before reading it", () => {
    const rootDir = createFixtureRoot();
    const outsideDir = mkdtempSync(join(tmpdir(), "production-domain-contract-source-link-"));
    const leakedSource = join(outsideDir, "CURRENT_SOURCE_OF_TRUTH.md");
    writeFileSync(leakedSource, `# Current Source of Truth\n${legacyAuthIssuer}\n`, "utf8");
    rmSync(join(rootDir, "docs/sync/CURRENT_SOURCE_OF_TRUTH.md"));
    symlinkSync(leakedSource, join(rootDir, "docs/sync/CURRENT_SOURCE_OF_TRUTH.md"));

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.files).not.toContain("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_SOURCE_OF_TRUTH_PATH",
          path: "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
        }),
      ]),
    );
    expect(result.errors.some((error) => error.message.includes(legacyDomain))).toBe(false);
  });

  it("fails when a tracked runtime or test file keeps an active .com reference", () => {
    const rootDir = createFixtureRoot();
    write(rootDir, "tests/example.test.ts", `const origin = "${legacyAuthIssuer}";\n`);

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "tests/example.test.ts:1",
          message: expect.stringContaining(legacyDomain),
        }),
      ]),
    );
  });

  it("fails when CURRENT_SOURCE_OF_TRUTH omits one canonical production-domain note entry", () => {
    const rootDir = createFixtureRoot();
    write(
      rootDir,
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      [
        "# Current Source of Truth",
        "",
        "## Official Files",
        "- `docs/요구사항기준선-v1.7.30.md`",
        "- `docs/화면정의서-v1.5.34.md`",
        "- `docs/유저flow맵-v1.3.32.md`",
        "- `docs/db설계-v1.3.32.md`",
        "- `docs/api문서-v1.2.37.md`",
        "",
        `> production 단일 origin은 ${PRODUCTION_DOMAIN_TUPLE.appOrigin}와 ${PRODUCTION_DOMAIN_TUPLE.authOrigin}다.`,
        "> callback은 /auth/callback 두 기존 경로만 사용한다.",
      ].join("\n"),
    );

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_CANONICAL_SOURCE_OF_TRUTH_NOTE",
          path: "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
        }),
      ]),
    );
  });

  it("fails when the full-local README omits one exact production-domain tuple entry", () => {
    const rootDir = createFixtureRoot();
    write(
      rootDir,
      "docs/workpacks/full-local-supabase-production/README.md",
      [
        `app ${PRODUCTION_DOMAIN_TUPLE.appOrigin}`,
        `auth ${PRODUCTION_DOMAIN_TUPLE.authOrigin}`,
        `callback ${PRODUCTION_DOMAIN_TUPLE.callback}`,
      ].join("\n"),
    );

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_CANONICAL_WORKPACK_README_TUPLE",
          path: "docs/workpacks/full-local-supabase-production/README.md",
        }),
      ]),
    );
  });

  it("fails when acceptance omits one exact production-domain callback tuple entry", () => {
    const rootDir = createFixtureRoot();
    write(
      rootDir,
      "docs/workpacks/full-local-supabase-production/acceptance.md",
      [
        "# acceptance",
        `app ${PRODUCTION_DOMAIN_TUPLE.appOrigin}`,
        `auth ${PRODUCTION_DOMAIN_TUPLE.authOrigin}`,
        `callback ${PRODUCTION_DOMAIN_TUPLE.callback}`,
      ].join("\n"),
    );

    const [missingLinkResult] = validateProductionDomainContract({ rootDir });

    expect(missingLinkResult.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_CANONICAL_ACCEPTANCE_TUPLE",
          path: "docs/workpacks/full-local-supabase-production/acceptance.md",
        }),
      ]),
    );

    write(
      rootDir,
      "docs/workpacks/full-local-supabase-production/acceptance.md",
      [
        "# acceptance",
        `app ${PRODUCTION_DOMAIN_TUPLE.appOrigin}`,
        `auth ${PRODUCTION_DOMAIN_TUPLE.authOrigin}`,
        `link ${PRODUCTION_DOMAIN_TUPLE.linkCallback}`,
      ].join("\n"),
    );

    const [missingCallbackResult] = validateProductionDomainContract({ rootDir });

    expect(missingCallbackResult.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_CANONICAL_ACCEPTANCE_TUPLE",
          path: "docs/workpacks/full-local-supabase-production/acceptance.md",
        }),
      ]),
    );
  });

  it("fails when the exact .kr tuple is incomplete in the production env example", () => {
    const rootDir = createFixtureRoot();
    write(
      rootDir,
      "infra/full-local-supabase/.env.production.example",
      [
        `FULL_LOCAL_ADDITIONAL_REDIRECT_URLS=${PRODUCTION_DOMAIN_TUPLE.callback}`,
        `FULL_LOCAL_API_EXTERNAL_URL=${PRODUCTION_DOMAIN_TUPLE.authOrigin}/auth/v1`,
        `FULL_LOCAL_PUBLIC_AUTH_URL=${PRODUCTION_DOMAIN_TUPLE.authOrigin}`,
        `FULL_LOCAL_SITE_URL=${PRODUCTION_DOMAIN_TUPLE.appOrigin}`,
      ].join("\n"),
    );

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "infra/full-local-supabase/.env.production.example",
          message: expect.stringContaining("FULL_LOCAL_ADDITIONAL_REDIRECT_URLS"),
        }),
      ]),
    );
  });

  it("fails on fallback scan for text shell and toml files without extension allowlists", () => {
    const rootDir = createFixtureRoot();
    write(rootDir, "scripts/check-domain.sh", `echo "${legacyAuthIssuer}"\n`);
    write(rootDir, "infra/full-local-supabase/runtime.toml", `site = "${legacyAppCallback}"\n`);

    const [result] = validateProductionDomainContract({ rootDir });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "scripts/check-domain.sh:1",
          message: expect.stringContaining(legacyDomain),
        }),
        expect.objectContaining({
          path: "infra/full-local-supabase/runtime.toml:1",
          message: expect.stringContaining(legacyDomain),
        }),
      ]),
    );
  });
});
