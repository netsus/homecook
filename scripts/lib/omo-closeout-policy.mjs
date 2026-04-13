import { resolve } from "node:path";

export function resolveAllowedCloseoutRelativePaths({ slice }) {
  return [
    "docs/workpacks/README.md",
    `docs/workpacks/${slice}/README.md`,
    `docs/workpacks/${slice}/acceptance.md`,
    `docs/workpacks/${slice}/automation-spec.json`,
  ];
}

export function resolveAllowedCloseoutAbsolutePaths({ worktreePath, slice }) {
  return new Set(
    resolveAllowedCloseoutRelativePaths({ slice }).map((filePath) => resolve(worktreePath, filePath)),
  );
}
