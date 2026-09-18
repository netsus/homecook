#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFullLocalBackupReadiness } from "./full-local-production-runtime.mjs";
import { parseFullLocalProductionConfig, selectExactFullLocalServiceImages, selectFullLocalProductionResources } from "./lib/full-local-production-resources.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVICES = ["postgres", "auth", "postgrest", "storage", "api-gateway", "auth-proxy", "postgrest-probe"];
const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  if (index < 0 || !isAbsolute(argv[index + 1] ?? "")) throw new Error(`${name} requires an absolute path`);
  return argv[index + 1];
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
function privateFile(path, allowMissing = false) {
  const parent = dirname(path);
  const stat = lstatSync(parent);
  const fromRoot = relative(ROOT, path);
  if (realpathSync(parent) !== parent || !stat.isDirectory() || stat.uid !== process.getuid?.()
    || (stat.mode & 0o777) !== 0o700 || (!fromRoot.startsWith("../") && !isAbsolute(fromRoot))) {
    throw new Error("Resume inputs must use private canonical directories outside the repository");
  }
  try {
    const file = lstatSync(path);
    if (!file.isFile() || file.isSymbolicLink() || file.uid !== process.getuid?.() || (file.mode & 0o777) !== 0o600) throw new Error("Unsafe resume input");
  } catch (error) {
    if (!allowMissing || error.code !== "ENOENT") throw error;
  }
}
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error("Local Docker operation failed");
  return result.stdout;
}
function containers(project) {
  const ids = docker(["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`]).trim().split(/\s+/).filter(Boolean);
  if (ids.length !== SERVICES.length) throw new Error("The complete existing container set is required; recreation is forbidden");
  const rows = JSON.parse(docker(["inspect", ...ids]));
  return SERVICES.map((service) => {
    const matches = rows.filter((row) => row.Config.Labels?.["com.docker.compose.service"] === service);
    if (matches.length !== 1) throw new Error("Existing service identity is ambiguous");
    return matches[0];
  });
}
function binding(row) {
  if (!/@sha256:[0-9a-f]{64}$/u.test(row.Config.Image) || !/^sha256:[0-9a-f]{64}$/u.test(row.Image)) throw new Error("Pinned existing service image is required");
  for (const ports of Object.values(row.HostConfig.PortBindings ?? {})) {
    if ((ports ?? []).some((port) => !["127.0.0.1", "::1"].includes(port.HostIp))) throw new Error("Full-local service ports must remain loopback-only");
  }
  return {
    id: row.Id, name: row.Name, image: row.Image, image_ref: row.Config.Image,
    service: row.Config.Labels["com.docker.compose.service"], labels: row.Config.Labels,
    environment_sha256: hash(JSON.stringify(row.Config.Env)),
    command_sha256: hash(JSON.stringify([row.Config.Entrypoint, row.Config.Cmd])),
    mounts: row.Mounts.map(({ Type, Name, Source, Destination, RW }) => ({ Type, Name, Source, Destination, RW }))
      .sort((left, right) => left.Destination.localeCompare(right.Destination)),
    port_bindings: row.HostConfig.PortBindings,
    networks: Object.keys(row.NetworkSettings.Networks).sort(),
  };
}
function volumes(config) {
  return JSON.parse(docker(["volume", "inspect", config.FULL_LOCAL_POSTGRES_VOLUME_NAME, config.FULL_LOCAL_STORAGE_VOLUME_NAME]))
    .map(({ Name, Driver, Labels, Mountpoint, Options }) => ({ Name, Driver, Labels, Mountpoint, Options }));
}
function same(expected, observed) {
  if (JSON.stringify(expected) !== JSON.stringify(observed)) throw new Error("Existing runtime bindings changed; refusing to resume");
}
function healthy(row) {
  return row.State.Running && (!row.State.Health || row.State.Health.Status === "healthy");
}
async function main() {
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (seen.has(flag) || !["--config", "--inventory", "--seal", "--check-only"].includes(flag)) throw new Error("Unsupported or repeated resume option");
    seen.add(flag);
    if (["--config", "--inventory"].includes(flag)) index += 1;
  }
  const configPath = option("--config");
  const inventoryPath = option("--inventory");
  const seal = argv.includes("--seal");
  const checkOnly = argv.includes("--check-only");
  if (seal && checkOnly) throw new Error("Select either sealing or checking");
  privateFile(configPath);
  privateFile(inventoryPath, seal);
  const configBytes = readFileSync(configPath);
  const config = parseFullLocalProductionConfig(configBytes.toString("utf8"));
  const context = JSON.parse(docker(["context", "inspect"]));
  const endpoint = process.env.DOCKER_CONTEXT
    ? context[0]?.Endpoints?.docker?.Host
    : process.env.DOCKER_HOST || context[0]?.Endpoints?.docker?.Host;
  if (typeof endpoint !== "string" || !endpoint.startsWith("unix://")) throw new Error("Only a local Unix Docker socket is permitted");
  const project = config.FULL_LOCAL_COMPOSE_PROJECT_NAME;
  if (!/^[a-z0-9][a-z0-9_.-]{2,127}$/u.test(project ?? "")) throw new Error("Exact Compose project is required");
  for (const name of [config.FULL_LOCAL_POSTGRES_VOLUME_NAME, config.FULL_LOCAL_STORAGE_VOLUME_NAME]) {
    if (!/^[a-z0-9][a-z0-9_.-]{2,127}$/u.test(name ?? "")) throw new Error("Exact existing volume names are required");
  }
  const rows = containers(project);
  const observedVolumes = volumes(config);
  const resources = {
    composeProject: project, postgresContainerName: `${project}-postgres-1`,
    postgresImage: config.FULL_LOCAL_POSTGRES_IMAGE,
    postgresVolumeName: config.FULL_LOCAL_POSTGRES_VOLUME_NAME,
    storageVolumeName: config.FULL_LOCAL_STORAGE_VOLUME_NAME,
  };
  const observed = {
    config_sha256: hash(configBytes), docker_endpoint: endpoint,
    containers: rows.map(binding), volumes: observedVolumes,
  };
  if (seal) {
    if (rows.some((row) => !healthy(row))) throw new Error("Only a healthy current runtime can be sealed");
    selectFullLocalProductionResources({ config, containers: rows, volumes: observedVolumes });
    selectExactFullLocalServiceImages({ composeProject: project, containers: rows, expectedImages: { auth: config.FULL_LOCAL_AUTH_IMAGE, storage: config.FULL_LOCAL_STORAGE_IMAGE } });
  } else {
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    if (inventory.format !== "homecook-prelaunch-existing-runtime-v1") throw new Error("Invalid existing runtime inventory");
    same(inventory.bindings, observed);
  }
  const readiness = await loadFullLocalBackupReadiness({ config }, resources);
  same(hash(configBytes), hash(readFileSync(configPath)));
  same(observed.containers, containers(project).map(binding));
  same(observed.volumes, volumes(config));
  if (seal) {
    writeFileSync(inventoryPath, `${JSON.stringify({ format: "homecook-prelaunch-existing-runtime-v1", created_at: new Date().toISOString(), bindings: observed }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return { status: "SEALED", services: SERVICES.length };
  }
  const started = [];
  try {
    for (const expected of observed.containers) {
      let row = JSON.parse(docker(["inspect", expected.id]))[0];
      same(expected, binding(row));
      if (!row.State.Running) {
        if (row.State.Status !== "exited") throw new Error("Only previously existing stopped containers may be resumed");
        if (checkOnly) continue;
        docker(["start", expected.id]);
        started.push(expected.id);
      }
      for (let attempt = 0; !healthy(row) && attempt < 30; attempt += 1) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
        row = JSON.parse(docker(["inspect", expected.id]))[0];
      }
      if (!healthy(row)) throw new Error("An existing service did not become healthy");
    }
    const stopped = checkOnly ? rows.filter((row) => !row.State.Running).length : 0;
    return { status: stopped ? "READY_TO_RESUME" : "PASS", check_only: checkOnly, services: SERVICES.length, started: started.length, stopped, backup_age_hours: readiness.backup_age_hours };
  } catch (error) {
    const cleanupFailures = [];
    for (const id of started.reverse()) {
      try { docker(["stop", id]); } catch { cleanupFailures.push(id); }
    }
    if (cleanupFailures.length) throw new Error("Existing runtime recovery needs manual cleanup after a partial start");
    throw error;
  }
}

main().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
  process.exitCode = 1;
});
