const SAFE_RESOURCE_NAME = /^[a-z0-9][a-z0-9_.-]{2,127}$/u;
const POSTGRES_ROLE_IDENTIFIER = /^(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)$/u;

function required(config, name) {
  const value = config?.[name];
  if (typeof value !== "string" || !SAFE_RESOURCE_NAME.test(value)) {
    throw new Error(`${name} must be an exact safe production resource name`);
  }
  return value;
}

export function parseFullLocalProductionConfig(text) {
  if (typeof text !== "string") {
    throw new TypeError("Full-local production config text is required");
  }
  const config = {};
  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) throw new Error(`Invalid full-local config at line ${index + 1}`);
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    config[match[1]] = value;
  }
  return Object.freeze(config);
}

export function makePostgresRoleDumpIdempotent(sql) {
  if (typeof sql !== "string") {
    throw new TypeError("PostgreSQL role dump text is required");
  }
  const normalized = sql.replace(/^CREATE ROLE ([^;]+);$/gmu, (_statement, identifier) => {
    if (!POSTGRES_ROLE_IDENTIFIER.test(identifier)) {
      throw new Error("PostgreSQL role dump contains an unsafe CREATE ROLE statement");
    }
    const roleName = identifier.startsWith('"')
      ? identifier.slice(1, -1).replace(/""/gu, '"')
      : identifier.toLowerCase();
    const literal = roleName.replace(/'/gu, "''");
    return [
      "DO $homecook_role$",
      "BEGIN",
      `  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '${literal}') THEN`,
      `    EXECUTE 'CREATE ROLE ' || quote_ident('${literal}');`,
      "  END IF;",
      "END",
      "$homecook_role$;",
    ].join("\n");
  });
  if (/^CREATE ROLE\s/imu.test(normalized)) {
    throw new Error("PostgreSQL role dump contains an unsafe CREATE ROLE statement");
  }
  return normalized;
}

function exactVolume({ composeProject, expectedComposeVolume, name, volumes }) {
  const matches = volumes.filter((volume) => volume?.Name === name);
  if (matches.length !== 1) {
    throw new Error(`Expected one exact production Docker volume: ${name}`);
  }
  const [volume] = matches;
  if (
    volume.Labels?.["com.docker.compose.project"] !== composeProject
    || volume.Labels?.["com.docker.compose.volume"] !== expectedComposeVolume
  ) {
    throw new Error(`Production Docker volume provenance mismatch: ${name}`);
  }
  return volume;
}

export function selectFullLocalProductionResources({ config, containers, volumes }) {
  if (!Array.isArray(containers) || !Array.isArray(volumes)) {
    throw new TypeError("Complete Docker container and volume inventories are required");
  }
  const composeProject = required(config, "FULL_LOCAL_COMPOSE_PROJECT_NAME");
  const postgresVolumeName = required(config, "FULL_LOCAL_POSTGRES_VOLUME_NAME");
  const storageVolumeName = required(config, "FULL_LOCAL_STORAGE_VOLUME_NAME");
  const expectedImage = config?.FULL_LOCAL_POSTGRES_IMAGE;
  if (typeof expectedImage !== "string" || !/@sha256:[0-9a-f]{64}$/u.test(expectedImage)) {
    throw new Error("FULL_LOCAL_POSTGRES_IMAGE must be an exact reviewed digest");
  }
  const candidates = containers.filter((container) =>
    container?.Config?.Labels?.["com.docker.compose.project"] === composeProject
    && container?.Config?.Labels?.["com.docker.compose.service"] === "postgres");
  if (candidates.length !== 1) {
    throw new Error("Expected one exact production PostgreSQL container");
  }
  const [postgres] = candidates;
  if (
    postgres.Config?.Image !== expectedImage
    || postgres.State?.Running !== true
    || postgres.State?.Health?.Status !== "healthy"
  ) {
    throw new Error("Production PostgreSQL image or health provenance mismatch");
  }
  const postgresVolume = exactVolume({
    composeProject,
    expectedComposeVolume: "postgres-data",
    name: postgresVolumeName,
    volumes,
  });
  const storageVolume = exactVolume({
    composeProject,
    expectedComposeVolume: "storage-data",
    name: storageVolumeName,
    volumes,
  });
  return Object.freeze({
    composeProject,
    postgresContainerId: postgres.Id,
    postgresContainerName: String(postgres.Name ?? "").replace(/^\//u, ""),
    postgresImage: expectedImage,
    postgresVolumeName: postgresVolume.Name,
    storageVolumeName: storageVolume.Name,
  });
}
