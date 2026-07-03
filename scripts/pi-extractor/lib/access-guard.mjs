import path from "node:path";

const FORBIDDEN_BASENAME = new Set([
  "golden.json",
  "grade.json",
  "semantic-grade.json",
]);

const FORBIDDEN_PATTERNS = [
  /(^|[/\\])_grade_summary\.[^/\\]+\.json$/u,
  /(^|[/\\])_semantic_summary\.[^/\\]+\.json$/u,
  /(^|[/\\])runs[/\\][^/\\]+[/\\]result\.json$/u,
  /(^|[/\\])runs[/\\][^/\\]+[/\\]grade\.json$/u,
  /(^|[/\\])runs[/\\][^/\\]+[/\\]semantic-grade\.json$/u,
  /(^|[/\\])runs[/\\][^/\\]+[/\\]semantic-judge-raw\.json$/u,
];

export function resolveAccessPath(filePath, projectRoot = process.cwd()) {
  return path.resolve(projectRoot, filePath);
}

export function classifyForbiddenRead(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  const basename = path.basename(filePath);
  if (FORBIDDEN_BASENAME.has(basename)) {
    return `forbidden_basename:${basename}`;
  }
  const matched = FORBIDDEN_PATTERNS.find((pattern) => pattern.test(normalized));
  return matched ? `forbidden_pattern:${matched.source}` : null;
}

export function createAccessManifest({ projectRoot = process.cwd(), allowedReads = [] } = {}) {
  const allowedReadPaths = allowedReads.map((filePath) => resolveAccessPath(filePath, projectRoot));
  return {
    version: 1,
    projectRoot: resolveAccessPath(projectRoot, projectRoot),
    allowedReadPaths,
    readEvents: [],
    writeEvents: [],
    forbiddenReadEvents: [],
    createdAt: new Date().toISOString(),
  };
}

export function addAllowedRead(manifest, filePath) {
  const resolved = resolveAccessPath(filePath, manifest.projectRoot);
  if (!manifest.allowedReadPaths.includes(resolved)) {
    manifest.allowedReadPaths.push(resolved);
  }
  return resolved;
}

export function recordRead(manifest, filePath, reason = "read") {
  const resolved = resolveAccessPath(filePath, manifest.projectRoot);
  const forbiddenReason = classifyForbiddenRead(resolved);
  const allowed = manifest.allowedReadPaths.includes(resolved);
  const event = {
    path: resolved,
    reason,
    allowed,
    forbiddenReason,
    at: new Date().toISOString(),
  };
  manifest.readEvents.push(event);
  if (!allowed || forbiddenReason) {
    manifest.forbiddenReadEvents.push(event);
    throw new Error(`source-only guard blocked read: ${resolved}${forbiddenReason ? ` (${forbiddenReason})` : ""}`);
  }
  return resolved;
}

export function recordWrite(manifest, filePath, reason = "write") {
  const resolved = resolveAccessPath(filePath, manifest.projectRoot);
  const event = {
    path: resolved,
    reason,
    at: new Date().toISOString(),
  };
  manifest.writeEvents.push(event);
  return resolved;
}

export function assertNoForbiddenReads(manifest) {
  if (manifest.forbiddenReadEvents.length > 0) {
    const first = manifest.forbiddenReadEvents[0];
    throw new Error(`forbidden read recorded: ${first.path}`);
  }
  return true;
}
