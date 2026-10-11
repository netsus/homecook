import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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

const dependencyNames = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
]);
const forbiddenExternalPackages = ["oxlint", "@oxlint/plugins", "oxlint-plugin-anti-slop"];
const declaredExternalLintDependencies = forbiddenExternalPackages.filter((packageName) => dependencyNames.has(packageName));
if (declaredExternalLintDependencies.length > 0) {
  fail(`unapproved external lint dependencies are declared: ${declaredExternalLintDependencies.join(", ")}`);
}

const externalLintLockEntries = forbiddenExternalPackages.filter((packageName) =>
  lockfile.includes(`${packageName}@`),
);
if (externalLintLockEntries.length > 0) {
  fail(`unapproved external lint packages are locked: ${externalLintLockEntries.join(", ")}`);
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
      antiSlopMechanicalEnforcement: false,
      externalLintDirectDependenciesDeclared: declaredExternalLintDependencies,
      externalLintLockEntries,
    },
    null,
    2,
  )}\n`,
);
