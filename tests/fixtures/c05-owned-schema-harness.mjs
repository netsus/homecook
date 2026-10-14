import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

export const C05_NATIVE_IMAGE = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
export const C05_NATIVE_MIGRATIONS = [
  ["20261013190000_recipe_product_only_identity.sql", "0a1f518ab49a1171d825b87eaeea6210e59b4cf0e08022b40a3dea05fb1e7f75"],
  ["20261013233000_cooked_batch_weight_evidence.sql", "60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0"],
  ["20261014230000_weight_improvement_participation.sql", "bc263347ef51f7ffc86731b7c161618f3181b81cd00bf8f2ec57a01b989eeda8"],
];
// Fixed reviewed predecessors; no operating data or runtime settings are read.
const C04_NATIVE_MIGRATIONS = [
  ["20261014010000_ingredient_quantity_policy_v4.sql", "c66ee907de4130b2fe3b86bcdbe48b15021f228485e52fbe1aca5acfee5e7bfd"],
  ["20261014200000_quantity_input_v4_consumers.sql", "9ec96a2a7bbf7192801b1f6dd43304ed8ba78ab73f934eac4c2c300e3ca85573"],
  ["20261014210000_product_quantity_input_v4.sql", "e33a2110afd4a71a6042ce6d4d416f2bf189e107f4528e5b5ae2e440e180ad88"],
  ["20261014213000_product_quantity_edit_capability.sql", "acb0ec83aeabc91320a61b406c2a23dda258033592defbb09bd7f1bb8667399b"],
  ["20261014220000_recipe_quantity_input_v4.sql", "9b15696aa8f33cb6a9c707d1355a90efb07bd929df3943519e58b1d6d6cc2367"],
  ["20261014223000_youtube_quantity_input_bridge.sql", "f586b27f2f5da5063a7eaa70278c7f00edab762aa27248b91a224411f436c750"],
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

// This owns only a new offline container. It cannot attach to an existing DB,
// read runtime config, open a host port, or restore application rows.
export function createC05OwnedSchemaHarness() {
  const migrations = [...C05_NATIVE_MIGRATIONS.slice(0, 2), ...C04_NATIVE_MIGRATIONS,
    ["20261014224500_cooked_weight_user_attestation.sql", "d334ebe8824db1d4e94f865bc0bbd692c46cdde2f6c2077e4cac9d9f8db8d146"],
    C05_NATIVE_MIGRATIONS[2],
    ["20261014231000_weight_improvement_source_read.sql", "5ee6c6ba4d03cafe80b7a2c0b5f7ac64c2715467f454cb293bc62e70d08b6889"]];
  const tag = randomUUID().replaceAll("-", "");
  let container = "";
  const evidence = { image: C05_NATIVE_IMAGE, tag, container_id: "", application_rows_restored: null,
    ledger: null, before_seed_empty: null, ledger_count: 0, source_ledger_sha256: "", worker_bootstrap: null, migrations: [], resources_removed: false };
  const docker = (args, input) => spawnSync("docker", args, {
    input, encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024,
  });
  function assertOwned() {
    if (!/^[a-f0-9]{64}$/u.test(container)) throw new Error("An exact newly owned CID is required");
    const result = docker(["inspect", container]);
    if (result.status !== 0) throw new Error(result.stderr);
    const [state] = JSON.parse(result.stdout);
    if (state.Id !== container || state.Config.Labels["homecook.c05-integration"] !== tag
      || state.Config.Image !== C05_NATIVE_IMAGE || state.HostConfig.NetworkMode !== "none"
      || state.Mounts.length !== 0 || Object.keys(state.HostConfig.PortBindings ?? {}).length !== 0) {
      throw new Error("Refusing an unowned, networked or shared target");
    }
  }
  function exec(args, input) {
    assertOwned();
    return docker(["exec", "-i", container, ...args], input);
  }
  function sql(statement, { admin = false, succeeds = true } = {}) {
    const result = exec(["psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"],
      `${admin ? "" : "set session authorization postgres;"}\n${statement}`);
    if (succeeds && result.status !== 0) throw new Error(result.stderr);
    return result;
  }
  async function restore({ schemaArchive, rolesArchive }) {
    const schema = readFileSync(schemaArchive);
    const roles = readFileSync(rolesArchive, "utf8");
    if (digest(schema) !== "5447e5ae08359feb9750676820968daf2edcf0ed57b64997e718ccc8d8dae790"
      || digest(roles) !== "a37b43865c14194ab8aae8758c7f596679cc50e93f425d0af52767f54b9145d3"
      || /\bpassword\b/iu.test(roles)) throw new Error("Schema-only/password-free source digest drift");
    // The exact historical 219 prefix is reconstructed from reviewed source,
    // not an operating receipt. Its prior approved digest must still match.
    const ledger = readdirSync("supabase/migrations").filter(name => name.endsWith(".sql") && name < "20261013190000")
      .sort().map(filename => ({ filename, sha256: digest(readFileSync(`supabase/migrations/${filename}`)) }));
    if (digest(JSON.stringify(ledger)) !== "4da770185bf35bc0ff7834a8284766c54d314b1638146bae830157da626c5204") throw new Error("Historical source prefix drift");
    if (!Array.isArray(ledger) || ledger.length !== 219) throw new Error("Expected the exact 219-entry source ledger");
    for (const entry of ledger) {
      if (!/^\d{14}_[a-z0-9_]+\.sql$/u.test(entry.filename) || !/^[a-f0-9]{64}$/u.test(entry.sha256)
        || digest(readFileSync(`supabase/migrations/${entry.filename}`)) !== entry.sha256) throw new Error("Source ledger drift");
    }
    const launch = docker(["run", "--detach", "--platform", "linux/arm64", "--pull=never", "--network", "none",
      "--label", `homecook.c05-integration=${tag}`, "--entrypoint", "bash", C05_NATIVE_IMAGE, "-c",
      "mkdir -p /tmp/c05pg /tmp/pgsocket /var/run/postgresql; chown postgres:postgres /tmp/c05pg /tmp/pgsocket /var/run/postgresql; "
        + "exec gosu postgres bash -c 'initdb -D /tmp/c05pg -U supabase_admin --auth-local=trust --auth-host=reject --locale-provider=icu --icu-locale=en-US --locale=en_US.UTF-8 >/tmp/c05-initdb.log && "
        + "exec postgres -D /tmp/c05pg -c listen_addresses= -c unix_socket_directories=/tmp/pgsocket "
        + "-c timezone=UTC -c shared_preload_libraries=pg_stat_statements,supabase_vault'"]);
    if (launch.status !== 0) throw new Error(launch.stderr);
    container = launch.stdout.trim(); evidence.container_id = container;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (exec(["pg_isready", "-h", "/tmp/pgsocket", "-U", "supabase_admin"]).status === 0) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("Owned offline database did not initialize");
    // initdb already creates its matching superuser; all original ALTER ROLE
    // attributes, memberships and role configuration are restored unchanged.
    sql(roles.replace(/^CREATE ROLE supabase_admin;$/mu, ""), { admin: true });
    const restored = exec(["pg_restore", "--schema-only", "--exit-on-error", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres"], schema);
    if (restored.status !== 0) throw new Error(restored.stderr);
    sql(`do $empty$ declare t record; n bigint; begin
      for t in select schemaname,tablename from pg_tables where schemaname not in('pg_catalog','information_schema') and schemaname not like 'pg_%' loop
        execute format('select count(*) from %I.%I',t.schemaname,t.tablename) into n;
        if n<>0 then raise exception 'Restored application rows: %.% = %',t.schemaname,t.tablename,n;end if;
      end loop;
      if (select count(*) from homecook_deploy.migrations)<>0 then raise exception 'Ledger was not schema-only';end if;
    end $empty$;`, { admin: true });
    evidence.application_rows_restored = 0;
    evidence.before_seed_empty = JSON.parse(sql(`select jsonb_build_object('tables',count(*),'total_rows',0,'nonzero_tables',0)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p')
      and n.nspname not in('pg_catalog','information_schema') and n.nspname not like 'pg_%'
      and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e');`,{admin:true}).stdout.trim());
    evidence.ledger = JSON.parse(sql(`select jsonb_build_object('owner',pg_get_userbyid(relowner),
      'select',has_table_privilege('postgres',oid,'SELECT'),'insert',has_table_privilege('postgres',oid,'INSERT'),
      'update',has_table_privilege('postgres',oid,'UPDATE'),'delete',has_table_privilege('postgres',oid,'DELETE'))
      from pg_class where oid='homecook_deploy.migrations'::regclass;`, { admin: true }).stdout.trim());
    if (evidence.ledger.owner !== "supabase_admin" || evidence.ledger.select !== true
      || evidence.ledger.insert || evidence.ledger.update || evidence.ledger.delete) throw new Error("Original ledger authority drift");
    sql(`insert into homecook_deploy.migrations(filename,sha256) values ${ledger.map((entry) => `('${entry.filename}','${entry.sha256}')`).join(",")};`, { admin: true });
    evidence.source_ledger_sha256 = digest(JSON.stringify(ledger));
    evidence.ledger_count = 219;
  }
  function applyMigration(index) {
    if (evidence.migrations.length !== index || index >= migrations.length) throw new Error("Fixed migration sequence drift");
    const [filename, sha256] = migrations[index];
    const source = readFileSync(`supabase/migrations/${filename}`, "utf8");
    if (digest(source) !== sha256) throw new Error("Exact migration source drift");
    if (filename === "20261014223000_youtube_quantity_input_bridge.sql") {
      // The schema-only archive has no singleton rows. Use only the reviewed
      // disabled bootstrap from the existing worker migration, never live data.
      const bootstrap = readFileSync("supabase/migrations/20260812160000_youtube_async_extraction_notification.sql", "utf8");
      const start = bootstrap.indexOf("insert into private.youtube_extraction_current_policy (");
      const end = bootstrap.indexOf("create or replace function private.youtube_extraction_policy_snapshot_digest(");
      if (start < 0 || end <= start) throw new Error("Fixed OFF worker bootstrap source drift");
      const seed = bootstrap.slice(start, end);
      sql(seed, { admin: true });
      evidence.worker_bootstrap = { source: "20260812160000_youtube_async_extraction_notification.sql",
        source_sha256: digest(bootstrap), seed_sha256: digest(seed), synthetic_only: true, enabled: false };
      if (sql("select count(*)=1 and bool_and(not enabled) from private.youtube_extraction_current_policy;", { admin: true }).stdout.trim() !== "t") {
        throw new Error("Owned worker bootstrap must remain OFF");
      }
    }
    const principal = filename === "20261014223000_youtube_quantity_input_bridge.sql" ? "supabase_admin" : "postgres";
    sql(`do $principal$ begin if session_user<>'${principal}' or current_user<>'${principal}' then raise exception 'Wrong DDL principal';end if;end $principal$;\n${source}`, { admin: principal === "supabase_admin" });
    // History metadata has its original admin owner; feature DDL never borrows it.
    sql(`insert into homecook_deploy.migrations(filename,sha256) values('${filename}','${sha256}');`,{admin:true});
    evidence.ledger_count = Number(sql("select count(*) from homecook_deploy.migrations;").stdout.trim());
    if (evidence.ledger_count !== 220 + index) throw new Error("Owned history stage drift");
    evidence.migrations.push({ filename, sha256, principal });
  }
  function close() {
    if (!container) return;
    assertOwned();
    const removed = docker(["rm", "--force", container]);
    if (removed.status !== 0) throw new Error(removed.stderr);
    const probe = docker(["inspect", container]);
    if (probe.status === 0 || !/No such (object|container)/u.test(probe.stderr)) throw new Error("Owned container cleanup was incomplete");
    evidence.cleanup = { removed_exact_cid: container, remove_exit: removed.status, inspect_exit: probe.status, absent: true };
    evidence.resources_removed = true;
  }
  return { restore, applyMigration, sql, close, evidence };
}
