import { createHash } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function requireUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

function requireIssuer(value) {
  if (typeof value !== "string") {
    throw new Error("remote issuer is required.");
  }
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname.replace(/\/+$/u, "") !== "/auth/v1"
  ) {
    throw new Error("remote issuer must be an exact HTTPS /auth/v1 URL.");
  }
  return url.toString().replace(/\/+$/u, "");
}

function requireTimestamp(value, label) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return new Date(milliseconds).toISOString();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function populationDigest(rows) {
  return createHash("sha256")
    .update(
      rows.map((row) =>
        `${row.ownerUuid}:${row.identityCreatedAt}`).join("\n"),
      "utf8",
    )
    .digest("hex");
}

export function createRemoteIdentityDigest({
  identityCreatedAt,
  issuer,
  ownerUuid,
}) {
  const normalizedIssuer = requireIssuer(issuer);
  const normalizedOwner = requireUuid(ownerUuid, "ownerUuid");
  const normalizedCreatedAt = requireTimestamp(
    identityCreatedAt,
    "identityCreatedAt",
  );
  return createHash("sha256")
    .update([
      "v1",
      normalizedIssuer,
      normalizedOwner,
      normalizedCreatedAt,
    ].join("\n"), "utf8")
    .digest("hex");
}

export function createRemotePopulationSnapshot({ issuer, users }) {
  const normalizedIssuer = requireIssuer(issuer);
  if (!Array.isArray(users)) {
    throw new Error("remote users must be an array.");
  }
  const rows = users.map(({ id, created_at: createdAt }) => {
    const ownerUuid = requireUuid(id, "remote user id");
    const identityCreatedAt = requireTimestamp(
      createdAt,
      "remote user created_at",
    );
    return Object.freeze({
      identityCreatedAt,
      ownerUuid,
      remoteIdentityDigest: createRemoteIdentityDigest({
        identityCreatedAt,
        issuer: normalizedIssuer,
        ownerUuid,
      }),
    });
  }).sort((left, right) =>
    left.ownerUuid.localeCompare(right.ownerUuid)
    || left.identityCreatedAt.localeCompare(right.identityCreatedAt));
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].ownerUuid === rows[index].ownerUuid) {
      throw new Error("duplicate remote owner detected.");
    }
  }
  return Object.freeze({
    count: rows.length,
    digest: populationDigest(rows),
    issuer: normalizedIssuer,
    rows: Object.freeze(rows),
  });
}

export function assertRemotePopulationCas(first, second) {
  if (
    !first
    || !second
    || first.issuer !== second.issuer
    || first.count !== second.count
    || first.digest !== second.digest
  ) {
    throw new Error("remote population changed during CAS reads.");
  }
  return second;
}

function requireSnapshot(snapshot, issuer) {
  if (
    !snapshot
    || snapshot.issuer !== issuer
    || !Number.isSafeInteger(snapshot.count)
    || snapshot.count < 0
    || !SHA256_PATTERN.test(snapshot.digest)
    || !Array.isArray(snapshot.rows)
    || snapshot.rows.length !== snapshot.count
  ) {
    throw new Error("remote population snapshot is invalid.");
  }
}

function snapshotValues(snapshot) {
  if (snapshot.rows.length === 0) {
    return "";
  }
  return snapshot.rows.map((row) => {
    if (
      !UUID_PATTERN.test(row.ownerUuid)
      || !SHA256_PATTERN.test(row.remoteIdentityDigest)
      || requireTimestamp(
        row.identityCreatedAt,
        "identityCreatedAt",
      ) !== row.identityCreatedAt
    ) {
      throw new Error("remote population row is invalid.");
    }
    return [
      sqlLiteral(row.ownerUuid),
      sqlLiteral(row.identityCreatedAt),
      sqlLiteral(row.remoteIdentityDigest),
    ].join(", ");
  }).map((row) => `(${row})`).join(",\n");
}

function snapshotTupleValues(snapshot) {
  if (snapshot.rows.length === 0) {
    return `select
      null::uuid as owner_uuid,
      null::timestamptz as identity_created_at,
      null::text as remote_identity_digest
    where false`;
  }
  return `values
    ${snapshot.rows.map((row) => `(
      ${sqlLiteral(row.ownerUuid)}::uuid,
      ${sqlLiteral(row.identityCreatedAt)}::timestamptz,
      ${sqlLiteral(row.remoteIdentityDigest)}::text
    )`).join(",\n")}`;
}

function mirrorEvidenceSql({ issuer, snapshot }) {
  return `
    with remote_snapshot(
      owner_uuid,
      identity_created_at,
      remote_identity_digest
    ) as (
      ${snapshotTupleValues(snapshot)}
    ),
    active_mirror as (
      select
        epoch.owner_uuid,
        epoch.identity_created_at,
        epoch.remote_identity_digest
      from private.remote_auth_identity_epochs as epoch
      where epoch.issuer = ${sqlLiteral(issuer)}
        and epoch.active_epoch
        and epoch.deleted_terminal_at is null
    ),
    mirror_summary as (
      select
        count(*)::bigint as row_count,
        encode(
          extensions.digest(
            pg_catalog.convert_to(
              coalesce(
                string_agg(
                  active_mirror.owner_uuid::text
                    || ':'
                    || to_char(
                      active_mirror.identity_created_at at time zone 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                  E'\\n'
                  order by active_mirror.owner_uuid
                ),
                ''
              ),
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        ) as digest
      from active_mirror
    ),
    public_anti_join as (
      select count(*)::bigint as row_count
      from public.users as app_user
      where not exists (
        select 1
        from active_mirror
        where active_mirror.owner_uuid = app_user.id
      )
    ),
    remote_epoch_anti_join as (
      select count(*)::bigint as row_count
      from remote_snapshot as remote
      full join active_mirror as mirror
        on mirror.owner_uuid = remote.owner_uuid
       and mirror.identity_created_at = remote.identity_created_at
      where remote.owner_uuid is null
        or mirror.owner_uuid is null
    ),
    remote_identity_digest_mismatch as (
      select count(*)::bigint as row_count
      from remote_snapshot as remote
      join active_mirror as mirror
        on mirror.owner_uuid = remote.owner_uuid
       and mirror.identity_created_at = remote.identity_created_at
      where mirror.remote_identity_digest
        is distinct from remote.remote_identity_digest
    )
    select 'HOMECOOK_AUTH_MIRROR|' || json_build_object(
      'authUsers', (select count(*) from auth.users),
      'capability', (
        select state
        from public.account_generation_capability_state
        where singleton
      ),
      'mirrorCount', (select row_count from mirror_summary),
      'mirrorDigest', (select digest from mirror_summary),
      'publicOwnerAntiJoinCount', (
        select row_count from public_anti_join
      ),
      'remoteEpochAntiJoinCount', (
        select row_count from remote_epoch_anti_join
      ),
      'remoteIdentityDigestMismatchCount', (
        select row_count from remote_identity_digest_mismatch
      ),
      'remoteCount', ${snapshot.count},
      'remoteDigest', ${sqlLiteral(snapshot.digest)}
    )::text;
  `;
}

export function buildRemoteIdentityMirrorVerificationSql({
  issuer,
  snapshot,
}) {
  const normalizedIssuer = requireIssuer(issuer);
  requireSnapshot(snapshot, normalizedIssuer);
  return [
    "begin;",
    "set local lock_timeout = '15s';",
    "set local statement_timeout = '2min';",
    "lock table auth.users in share mode;",
    "lock table private.remote_auth_identity_epochs in share mode;",
    mirrorEvidenceSql({ issuer: normalizedIssuer, snapshot }).trim(),
    "rollback;",
    "",
  ].join("\n");
}

export function buildRemoteIdentityMirrorTransaction({
  dryRun,
  issuer,
  revision,
  snapshot,
  verifiedAt,
}) {
  const normalizedIssuer = requireIssuer(issuer);
  const normalizedVerifiedAt = requireTimestamp(verifiedAt, "verifiedAt");
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    throw new Error("revision must be a positive safe integer.");
  }
  requireSnapshot(snapshot, normalizedIssuer);
  const values = snapshotValues(snapshot);
  return [
    "begin;",
    "set local lock_timeout = '15s';",
    "set local statement_timeout = '2min';",
    "lock table auth.users in share row exclusive mode;",
    "lock table private.remote_auth_identity_epochs in share row exclusive mode;",
    `create temporary table homecook_remote_identity_snapshot (
      owner_uuid uuid primary key,
      identity_created_at timestamptz not null,
      remote_identity_digest text not null
        check (remote_identity_digest ~ '^[0-9a-f]{64}$')
    ) on commit drop;`,
    values
      ? `insert into homecook_remote_identity_snapshot (
          owner_uuid,
          identity_created_at,
          remote_identity_digest
        ) values
        ${values};`
      : "",
    `do $mirror_validation$
    declare
      expected_issuer text := current_setting(
        'app.settings.auth_expected_issuer',
        true
      );
      conflict_count bigint;
      capability_state text;
    begin
      if expected_issuer is distinct from ${sqlLiteral(normalizedIssuer)} then
        raise exception 'remote issuer mismatch';
      end if;
      if (select count(*) from auth.users) <> 0 then
        raise exception 'local auth.users must remain empty';
      end if;
      select state
        into capability_state
      from public.account_generation_capability_state
      where singleton
      for share;
      if capability_state is distinct from 'legacy' then
        raise exception 'account capability must remain legacy';
      end if;
      select count(*)
        into conflict_count
      from private.remote_auth_identity_epochs as epoch
      full join homecook_remote_identity_snapshot as remote
        on remote.owner_uuid = epoch.owner_uuid
       and epoch.issuer = ${sqlLiteral(normalizedIssuer)}
      where (
          epoch.issuer = ${sqlLiteral(normalizedIssuer)}
          and (
            remote.owner_uuid is null
            or epoch.identity_created_at
              is distinct from remote.identity_created_at
            or epoch.deleted_terminal_at is not null
            or not epoch.active_epoch
            or epoch.remote_identity_digest
              is distinct from remote.remote_identity_digest
          )
        )
        or (
          remote.owner_uuid is not null
          and epoch.owner_uuid is null
          and exists (
            select 1
            from private.remote_auth_identity_epochs as history
            where history.issuer = ${sqlLiteral(normalizedIssuer)}
              and history.owner_uuid = remote.owner_uuid
          )
        );
      if conflict_count <> 0 then
        raise exception 'remote identity deletion or recreation detected';
      end if;
    end;
    $mirror_validation$;`,
    `insert into private.remote_auth_identity_epochs (
      issuer,
      owner_uuid,
      identity_created_at,
      active_epoch,
      remote_revision,
      remote_identity_digest,
      verified_at,
      evidence_revision
    )
    select
      ${sqlLiteral(normalizedIssuer)},
      remote.owner_uuid,
      remote.identity_created_at,
      true,
      ${revision},
      remote.remote_identity_digest,
      ${sqlLiteral(normalizedVerifiedAt)}::timestamptz,
      ${revision}
    from homecook_remote_identity_snapshot as remote
    on conflict (issuer, owner_uuid, identity_created_at)
    do update
    set remote_revision = excluded.remote_revision,
        remote_identity_digest = excluded.remote_identity_digest,
        verified_at = excluded.verified_at,
        evidence_revision = excluded.evidence_revision,
        updated_at = clock_timestamp()
    where private.remote_auth_identity_epochs.active_epoch
      and private.remote_auth_identity_epochs.deleted_terminal_at is null
      and excluded.remote_revision
        >= private.remote_auth_identity_epochs.remote_revision
      and excluded.evidence_revision
        >= private.remote_auth_identity_epochs.evidence_revision;`,
    `do $mirror_equality$
    declare
      mirror_count bigint;
      mirror_digest text;
      public_anti_join_count bigint;
    begin
      select
        count(*),
        encode(
          extensions.digest(
            pg_catalog.convert_to(
              coalesce(
                string_agg(
                  epoch.owner_uuid::text
                    || ':'
                    || to_char(
                      epoch.identity_created_at at time zone 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                  E'\\n'
                  order by epoch.owner_uuid
                ),
                ''
              ),
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        )
        into mirror_count, mirror_digest
      from private.remote_auth_identity_epochs as epoch
      where epoch.issuer = ${sqlLiteral(normalizedIssuer)}
        and epoch.active_epoch
        and epoch.deleted_terminal_at is null;
      if mirror_count is distinct from ${snapshot.count}
        or mirror_digest is distinct from ${sqlLiteral(snapshot.digest)} then
        raise exception 'remote mirror exact population mismatch';
      end if;
      select count(*)
        into public_anti_join_count
      from public.users as app_user
      where not exists (
        select 1
        from private.remote_auth_identity_epochs as epoch
        where epoch.issuer = ${sqlLiteral(normalizedIssuer)}
          and epoch.owner_uuid = app_user.id
          and epoch.active_epoch
          and epoch.deleted_terminal_at is null
      );
      if public_anti_join_count <> 0 then
        raise exception 'public owner identity epoch anti-join mismatch';
      end if;
    end;
    $mirror_equality$;`,
    mirrorEvidenceSql({
      issuer: normalizedIssuer,
      snapshot,
    }).trim(),
    dryRun ? "rollback;" : "commit;",
    "",
  ].filter(Boolean).join("\n");
}
