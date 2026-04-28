#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findEmptyPrSections,
  findInvalidWorkflowV2Refs,
  findMissingPrSections,
} from "./lib/git-policy.mjs";
import { validateAuthorityEvidencePresence } from "./lib/validate-authority-evidence-presence.mjs";
import { validateExploratoryQaEvidence } from "./lib/validate-exploratory-qa-evidence.mjs";
import { validateRealSmokePresence } from "./lib/validate-real-smoke-presence.mjs";
import {
  extractMarkdownSection,
  normalizeInlineCode,
  readMarkdownLabelValue,
} from "./lib/validator-shared.mjs";

const PENDING_ACTUAL_VERIFICATION_TOKENS = [
  "pending manual confirmation",
  "manual confirmation",
  "수동 확인 필요",
  "확인 필요",
  "미실행",
  "not run",
  "not-run",
  "todo",
  "tbd",
];

function parseArgs(argv) {
  const args = {
    mode: "frontend",
    branch: null,
    prBody: null,
    slice: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--branch":
        args.branch = next;
        index += 1;
        break;
      case "--mode":
        args.mode = next;
        index += 1;
        break;
      case "--pr-body":
      case "--pr-body-file":
        args.prBody = next;
        index += 1;
        break;
      case "--slice":
        args.slice = next;
        index += 1;
        break;
      default:
        if (!arg.startsWith("--") && !args.prBody) {
          args.prBody = arg;
        }
        break;
    }
  }

  args.prBody = args.prBody ?? process.env.PR_BODY_FILE ?? null;
  args.slice = args.slice ?? process.env.SLICE ?? null;

  return args;
}

function normalizeMode(mode) {
  return typeof mode === "string" && mode.trim().length > 0
    ? mode.trim().toLowerCase()
    : "frontend";
}

function resolveValidationBranch({ mode, slice, explicitBranch }) {
  if (typeof explicitBranch === "string" && explicitBranch.trim().length > 0) {
    return explicitBranch.trim();
  }

  if (typeof slice !== "string" || slice.trim().length === 0) {
    return "";
  }

  const normalizedSlice = slice.trim();
  switch (normalizeMode(mode)) {
    case "backend":
      return `feature/be-${normalizedSlice}`;
    case "closeout":
      return `docs/omo-closeout-${normalizedSlice}`;
    case "docs":
      return `docs/${normalizedSlice}`;
    case "frontend":
    default:
      return `feature/fe-${normalizedSlice}`;
  }
}

function buildResult(name, errors) {
  return errors.length > 0 ? [{ name, errors }] : [];
}

function validatePrBodySections(body) {
  const errors = [
    ...findMissingPrSections(body).map((section) => ({
      path: "PR_BODY",
      message: `PR body is missing required section: ${section}`,
    })),
    ...findEmptyPrSections(body).map((section) => ({
      path: section,
      message: "PR body required section is empty or still contains a placeholder.",
    })),
    ...findInvalidWorkflowV2Refs(body).map((ref) => ({
      path: "PR_BODY:## Workpack / Slice",
      message: `Invalid workflow v2 work item reference: ${ref}`,
    })),
  ];

  return buildResult("pr-body-sections", errors);
}

function validateActualVerificationReady(body) {
  const sectionText = extractMarkdownSection(body, "## Actual Verification");
  if (sectionText.trim().length === 0) {
    return [];
  }

  const result = normalizeInlineCode(readMarkdownLabelValue(sectionText, "result")).toLowerCase();
  if (result.length === 0) {
    return [];
  }

  const matchedToken = PENDING_ACTUAL_VERIFICATION_TOKENS.find((token) => result.includes(token));
  if (!matchedToken) {
    return [];
  }

  return [
    {
      name: "actual-verification-ready",
      errors: [
        {
          path: "PR_BODY:## Actual Verification:result",
          message:
            `Actual Verification result still contains '${matchedToken}'. Replace pending manual confirmation with the concrete smoke result before ready-for-review.`,
        },
      ],
    },
  ];
}

export function validatePrReady({
  rootDir = process.cwd(),
  slice,
  prBodyPath,
  mode = "frontend",
  branch = null,
  env = process.env,
} = {}) {
  if (typeof prBodyPath !== "string" || prBodyPath.trim().length === 0) {
    return [
      {
        name: "validate-pr-ready:input",
        errors: [
          {
            path: "PR_BODY_FILE",
            message: "PR body file path is required via --pr-body or PR_BODY_FILE.",
          },
        ],
      },
    ];
  }

  const resolvedPrBodyPath = resolve(rootDir, prBodyPath.trim());
  const prBody = readFileSync(resolvedPrBodyPath, "utf8");
  const validationBranch = resolveValidationBranch({
    mode,
    slice,
    explicitBranch: branch,
  });
  const validationEnv = {
    ...env,
    BRANCH_NAME: validationBranch,
    PR_BODY_FILE: resolvedPrBodyPath,
    PR_IS_DRAFT: "false",
  };

  return [
    ...validatePrBodySections(prBody),
    ...validateActualVerificationReady(prBody),
    ...validateExploratoryQaEvidence({
      rootDir,
      env: validationEnv,
    }),
    ...validateAuthorityEvidencePresence({
      rootDir,
      env: validationEnv,
    }),
    ...validateRealSmokePresence({
      rootDir,
      env: validationEnv,
    }),
  ];
}

function printResults(results) {
  const failed = results.filter((result) => result.errors.length > 0);
  if (failed.length === 0) {
    process.stdout.write("PR ready validation passed\n");
    return 0;
  }

  for (const result of failed) {
    console.error(`PR ready validation failed for ${result.name}`);
    for (const error of result.errors) {
      console.error(`- ${error.path}: ${error.message}`);
    }
  }

  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const exitCode = printResults(
    validatePrReady({
      rootDir: process.cwd(),
      slice: args.slice,
      prBodyPath: args.prBody,
      mode: args.mode,
      branch: args.branch,
    }),
  );

  process.exit(exitCode);
}
