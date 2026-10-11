import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const files = {
  agents: "AGENTS.md",
  reviewSkill: ".agents/skills/homecook-typescript-evidence-review/SKILL.md",
  verificationSkill: ".agents/skills/verification-before-completion/SKILL.md",
  record: "docs/engineering/codex-quality-methods-20261011.md",
  notices: "THIRD_PARTY_NOTICES.md",
  packageJson: "package.json",
  lockfile: "pnpm-lock.yaml",
  antiSlopConfig: ".oxlintrc.json",
  antiSlopBaseline: "tools/oxlint/anti-slop-baseline.json",
  antiSlopUpstream: "tools/oxlint/anti-slop/UPSTREAM.md",
  antiSlopWorkflow: ".github/workflows/anti-slop.yml",
};

function fail(message) {
  throw new Error(`Codex quality tooling verification failed: ${message}`);
}

async function read(relativePath) {
  try {
    return await readFile(path.join(repositoryRoot, relativePath), "utf8");
  } catch (error) {
    fail(`${relativePath} could not be read (${error instanceof Error ? error.message : String(error)})`);
  }
}

function assertContains(content, expected, relativePath) {
  if (!content.includes(expected)) {
    fail(`${relativePath} must contain ${JSON.stringify(expected)}`);
  }
}

function readFrontmatter(content, relativePath) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    fail(`${relativePath} must start with YAML frontmatter`);
  }

  const frontmatter = match[1];
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();

  if (!name || !description) {
    fail(`${relativePath} frontmatter requires non-empty name and description`);
  }

  return { name, description };
}

const agents = await read(files.agents);
const reviewSkill = await read(files.reviewSkill);
const verificationSkill = await read(files.verificationSkill);
const record = await read(files.record);
const notices = await read(files.notices);
const packageJsonText = await read(files.packageJson);
const lockfile = await read(files.lockfile);
const packageJson = JSON.parse(packageJsonText);
const antiSlopConfig = await read(files.antiSlopConfig);
const antiSlopBaselineText = await read(files.antiSlopBaseline);
const antiSlopBaseline = JSON.parse(antiSlopBaselineText);
const antiSlopUpstream = await read(files.antiSlopUpstream);
const antiSlopWorkflow = await read(files.antiSlopWorkflow);

const expectedSkills = [
  {
    expectedName: "homecook-typescript-evidence-review",
    relativePath: files.reviewSkill,
    content: reviewSkill,
    agentsRequirement:
      "TypeScript/JavaScript를 새로 작성하거나 의미 있게 리팩터링·리뷰할 때는 `homecook-typescript-evidence-review` 스킬을 적용한다.",
  },
  {
    expectedName: "verification-before-completion",
    relativePath: files.verificationSkill,
    content: verificationSkill,
    agentsRequirement:
      "커밋, PR 생성, 머지 또는 완료·통과 주장 직전에는 `verification-before-completion` 스킬을 적용해",
  },
];

for (const skill of expectedSkills) {
  const frontmatter = readFrontmatter(skill.content, skill.relativePath);
  if (frontmatter.name !== skill.expectedName) {
    fail(`${skill.relativePath} name must be ${skill.expectedName}, received ${frontmatter.name}`);
  }
  assertContains(agents, skill.agentsRequirement, files.agents);
}

const agentsBytes = Buffer.byteLength(agents, "utf8");
const defaultInstructionBudgetBytes = 32 * 1024;
if (agentsBytes > defaultInstructionBudgetBytes) {
  fail(`AGENTS.md is ${agentsBytes} bytes, over the Codex default ${defaultInstructionBudgetBytes}-byte instruction budget`);
}

if (packageJson.scripts?.["verify:codex-quality-tooling"] !== "node scripts/verify-codex-quality-tooling.mjs") {
  fail("package.json must expose verify:codex-quality-tooling");
}

for (const packageName of ["oxlint", "@oxlint/plugins"]) {
  if (packageJson.devDependencies?.[packageName] !== "1.78.0") {
    fail(`${packageName} must be an exact 1.78.0 devDependency`);
  }
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    if (packageJson[field]?.[packageName] !== undefined) {
      fail(`${packageName} must not be declared in ${field}`);
    }
  }
}
if (packageJson.devDependencies?.["oxlint-plugin-anti-slop"] !== undefined) {
  fail("unofficial oxlint-plugin-anti-slop package must not be installed");
}
assertContains(lockfile, "'@oxlint/plugins@1.78.0':", files.lockfile);
assertContains(lockfile, "oxlint@1.78.0:", files.lockfile);
assertContains(lockfile, "sha512-Ypt8KeRYw+4jUtlPirfcHWMrn5ms12VrrFPD+Mds477/7tJxG1Kcz2Yrg2nVcTQEUx/GdlhS+BUg1kmxNm04Ug==", files.lockfile);
assertContains(lockfile, "sha512-QgQePuxIqKOzo1KSjG2EnITEeWvWnKAm77eq8nrMtf6AGoA+zyGc4PFYtDNJSD25g/ibOwfQ851hZ4/SPkMVoA==", files.lockfile);

const vendoredHashes = {
  "tools/oxlint/anti-slop/rules/no-array-filter-map.ts": "528bba857b84712c038e35e59079cc1e6c78a0421c65bb3c6117c9d412a2f28a",
  "tools/oxlint/anti-slop/rules/no-reduce-accumulator-copy.ts": "dce4b08ee7ac4bbedfe743f6fa4a3d423cde50b37691130b899cc4573c05d2ae",
  "tools/oxlint/anti-slop/rules/no-chained-type-assertions.ts": "72f8e981520f94adac0ffbdab8f8e84e5f2a4595f14e4a6471be917a85a20a15",
  "tools/oxlint/anti-slop/rules/no-conditional-empty-object-spread.ts": "33f044030d208fcc10be73bb19c8172c275c5229df4b0ca8ec10f069bbe60062",
  "tools/oxlint/anti-slop/shared/array-method.ts": "e360557253c56ab7c256623f3338415743e5027e9d999f801fb79d98240d217b",
  "tools/oxlint/anti-slop/LICENSE": "10ed33bf340d6d63dc0633dfc917a346b369b6aa41fe20734aefc6a3fb75ba17",
};
for (const [relativePath, expectedHash] of Object.entries(vendoredHashes)) {
  const content = await read(relativePath);
  const actualHash = createHash("sha256").update(content).digest("hex");
  if (actualHash !== expectedHash) fail(`${relativePath} hash is ${actualHash}, expected ${expectedHash}`);
  assertContains(antiSlopUpstream, expectedHash, files.antiSlopUpstream);
}

for (const rule of [
  "anti-slop/no-array-filter-map",
  "anti-slop/no-chained-type-assertions",
  "anti-slop/no-conditional-empty-object-spread",
  "anti-slop/no-reduce-accumulator-copy",
  "oxc/no-accumulating-spread",
]) {
  assertContains(antiSlopConfig, `\"${rule}\": \"error\"`, files.antiSlopConfig);
}
if (antiSlopBaseline.sourceCommit !== "c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b") {
  fail("Anti Slop baseline must name the reviewed upstream commit");
}
if (!Array.isArray(antiSlopBaseline.findings) || antiSlopBaseline.findings.length === 0) {
  fail("Anti Slop baseline must record the reviewed existing findings");
}
if (packageJson.scripts?.["verify:anti-slop"] !== "node scripts/test-anti-slop-fixtures.mjs && tsc --noEmit -p tools/oxlint/tsconfig.json && node scripts/run-anti-slop.mjs") {
  fail("package.json must expose verify:anti-slop");
}
assertContains(antiSlopWorkflow, "pnpm verify:anti-slop", files.antiSlopWorkflow);
assertContains(antiSlopWorkflow, "pnpm verify:codex-quality-tooling", files.antiSlopWorkflow);
for (const action of [
  "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
  "pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1",
  "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
]) {
  assertContains(antiSlopWorkflow, action, files.antiSlopWorkflow);
  assertContains(record, action, files.record);
}

for (const sourceRevision of [
  "2714c965e6be1fa2597510e66651e63bc67cb448",
  "2c606141936f1eeef17fa3043a72095b4765b9c2",
  "c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b",
  "bb92a77741419a4ab5f06e711a283343f1ada0c3",
]) {
  assertContains(record, sourceRevision, files.record);
}

assertContains(notices, "Copyright (c) 2025 Jesse Vincent", files.notices);
assertContains(notices, "Copyright (c) 2026 Dillon Mulroy", files.notices);
assertContains(notices, "Permission is hereby granted, free of charge", files.notices);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      repositoryRoot,
      agentsBytes,
      defaultInstructionBudgetBytes,
      skills: expectedSkills.map(({ expectedName, relativePath }) => ({ name: expectedName, path: relativePath })),
      antiSlopMechanicalEnforcement: true,
      antiSlopVersion: "1.78.0",
      vendoredFilesVerified: Object.keys(vendoredHashes).length,
      baselineFindings: antiSlopBaseline.findings.reduce((total, finding) => total + finding.count, 0),
    },
    null,
    2,
  )}\n`,
);
