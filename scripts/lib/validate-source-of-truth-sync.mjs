import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SCAN_TARGETS = [
  "AGENTS.md",
  "docs/engineering",
  ".claude/agents",
  "scripts",
  ".opencode/README.md",
];

const ALLOWED_EXTENSIONS = new Set([".md", ".mjs", ".js", ".ts", ".json"]);

const DOC_KINDS = [
  {
    key: "requirements",
    label: "requirements",
    prefix: "요구사항기준선-v",
  },
  {
    key: "screens",
    label: "screens",
    prefix: "화면정의서-v",
  },
  {
    key: "flow",
    label: "flow",
    prefix: "유저flow맵-v",
  },
  {
    key: "db",
    label: "db/schema",
    prefix: "db설계-v",
  },
  {
    key: "api",
    label: "api",
    prefix: "api문서-v",
  },
];

function extractMarkdownSection(text, heading) {
  const headingMarker = `${heading}\n`;
  const startIndex = text.indexOf(headingMarker);
  if (startIndex === -1) {
    return "";
  }

  const rest = text.slice(startIndex + headingMarker.length);
  const nextHeadingIndex = rest.search(/^##\s/m);
  return nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex);
}

function walkFiles(targetPath) {
  if (!existsSync(targetPath)) {
    return [];
  }

  const stats = statSync(targetPath);
  if (stats.isFile()) {
    return ALLOWED_EXTENSIONS.has(path.extname(targetPath)) ? [targetPath] : [];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  return readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      return walkFiles(childPath);
    }

    return ALLOWED_EXTENSIONS.has(path.extname(childPath)) ? [childPath] : [];
  });
}

export function readCurrentSourceOfTruth({ rootDir = process.cwd() } = {}) {
  const sourcePath = path.join(rootDir, "docs", "sync", "CURRENT_SOURCE_OF_TRUTH.md");
  if (!existsSync(sourcePath)) {
    return {
      sourcePath,
      officialFiles: null,
      errors: [
        {
          path: "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
          message: "Missing CURRENT_SOURCE_OF_TRUTH.md",
        },
      ],
    };
  }

  const contents = readFileSync(sourcePath, "utf8");
  const officialFilesSection = extractMarkdownSection(contents, "## Official Files");
  const officialPaths = [...officialFilesSection.matchAll(/^\s*-\s*`([^`]+)`\s*$/gm)].map((match) => match[1]);

  const officialFiles = {};
  const errors = [];

  for (const kind of DOC_KINDS) {
    const matchedPath = officialPaths.find((candidatePath) => path.basename(candidatePath).startsWith(kind.prefix));
    if (!matchedPath) {
      errors.push({
        path: sourcePath,
        message: `CURRENT_SOURCE_OF_TRUTH is missing the official ${kind.label} file entry.`,
      });
      continue;
    }

    officialFiles[kind.key] = {
      path: matchedPath,
      basename: path.basename(matchedPath),
    };
  }

  return {
    sourcePath,
    officialFiles,
    errors,
  };
}

export function validateSourceOfTruthSync({
  rootDir = process.cwd(),
  scanTargets = SCAN_TARGETS,
} = {}) {
  const { officialFiles, errors: sourceErrors } = readCurrentSourceOfTruth({ rootDir });
  const errors = [...sourceErrors];

  if (!officialFiles) {
    return [
      {
        name: "source-of-truth-sync",
        errors,
      },
    ];
  }

  const compiledKinds = DOC_KINDS.map((kind) => ({
    ...kind,
    currentBasename: officialFiles[kind.key]?.basename,
    pattern: new RegExp(`(${kind.prefix}[0-9.]+\\.md)`, "g"),
  })).filter((kind) => typeof kind.currentBasename === "string");

  const filesToScan = scanTargets.flatMap((target) => walkFiles(path.join(rootDir, target)));

  for (const filePath of filesToScan) {
    const relativePath = path.relative(rootDir, filePath) || path.basename(filePath);
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const kind of compiledKinds) {
        const matchedBasenames = new Set(
          [...line.matchAll(kind.pattern)].map((match) => match[1]),
        );

        for (const referencedBasename of matchedBasenames) {
          if (referencedBasename === kind.currentBasename) {
            continue;
          }

          errors.push({
            path: `${relativePath}:${index + 1}`,
            message:
              `Stale ${kind.label} reference '${referencedBasename}' found. ` +
              `Use '${kind.currentBasename}' from docs/sync/CURRENT_SOURCE_OF_TRUTH.md.`,
          });
        }
      }
    });
  }

  return [
    {
      name: "source-of-truth-sync",
      errors,
    },
  ];
}
