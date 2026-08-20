import { PINNED_SUPABASE_CLI_VERSION } from "./full-local-platform-backup.mjs";

const SAFE_SUFFIX = /^[a-z0-9][a-z0-9-]{2,7}$/u;
const ISOLATED_TARGET = /^homecook-backup-drill-[a-z0-9-]+$/u;

export function assertIsolatedDrillTarget(target) {
  if (typeof target !== "string" || !ISOLATED_TARGET.test(target)) {
    throw new Error("Backup restore drill may target isolated drill resources only");
  }
  return target;
}

export function buildIsolatedDrillPlan({ suffix }) {
  if (!SAFE_SUFFIX.test(suffix)) {
    throw new Error("Backup restore drill suffix is invalid");
  }
  const projectId = assertIsolatedDrillTarget(`homecook-backup-drill-${suffix}`);
  const restoreProjectId = assertIsolatedDrillTarget(`${projectId}-restore`);
  return Object.freeze({
    cli_version: PINNED_SUPABASE_CLI_VERSION,
    destructive_scope: "isolated-fixture-only",
    project_id: projectId,
    restore_database_container: assertIsolatedDrillTarget(`${restoreProjectId}-postgres-1`),
    restore_postgres_volume: assertIsolatedDrillTarget(`${restoreProjectId}-postgres`),
    restore_project_id: restoreProjectId,
    restore_storage_volume: assertIsolatedDrillTarget(`${restoreProjectId}-storage`),
    source_database_container: assertIsolatedDrillTarget(`${projectId}-postgres-1`),
    source_postgres_volume: assertIsolatedDrillTarget(`${projectId}-postgres`),
    source_storage_volume: assertIsolatedDrillTarget(`${projectId}-storage`),
  });
}

function safeStorageSegment(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Storage ${label} is invalid`);
  }
  return value;
}

export function mapStorageRowsToPayloadReferences(rows, physicalPaths) {
  if (!Array.isArray(physicalPaths)) {
    throw new Error("Exact Storage payload paths are required");
  }
  return rows
    .map((row) => {
      const bucket = safeStorageSegment(row?.bucket_id, "bucket");
      const name = safeStorageSegment(row?.name, "name");
      const version = safeStorageSegment(row?.version, "version");
      const base = `${bucket}/${name}`;
      const candidates = [
        `${base}/${version}`,
        `stub/${base}/${version}`,
        `stub/stub/${base}/${version}`,
        `${base}-$v-${version}`,
        `stub/${base}-$v-${version}`,
        `stub/stub/${base}-$v-${version}`,
      ];
      const matchingPaths = physicalPaths.filter((path) =>
        candidates.includes(path)
        || candidates.some((candidate) => {
          const suffix = `/${candidate}`;
          if (!path.endsWith(suffix)) return false;
          const prefix = path.slice(0, -suffix.length).split("/");
          return prefix.length === 2
            && prefix.every((segment) => {
              try {
                safeStorageSegment(segment, "tenant/project prefix");
                return true;
              } catch {
                return false;
              }
            });
        }));
      if (matchingPaths.length !== 1) {
        throw new Error("Database reference must resolve one exact Storage payload");
      }
      return Object.freeze({
        path: matchingPaths[0],
        reference: `${bucket}/${name}`,
      });
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function filterRunningIsolatedContainers(states) {
  return states
    .filter((state) => {
      assertIsolatedDrillTarget(state?.name);
      return state.running === true;
    })
    .map((state) => state.name);
}
