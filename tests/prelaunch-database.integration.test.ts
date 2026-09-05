import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createPrelaunchDatabase } from "../scripts/lib/prelaunch-database.mjs";
import { readPinnedLocalDockerTarget } from "../scripts/lib/local-supabase-isolated-runtime.mjs";

it.skipIf(process.env.PRELAUNCH_DB_INTEGRATION !== "1")("applies on disposable postgres, preserves rows in full backup, rolls back failures, and rejects tampered history", async () => {
  const pinned = readPinnedLocalDockerTarget();
  const env: NodeJS.ProcessEnv = { ...process.env, DOCKER_HOST: pinned.docker_host };
  delete env.DOCKER_CONTEXT;
  const project = `prelaunch-test-${randomUUID().slice(0, 8)}`;
  const pgVolume = `${project}-postgres`;
  const storageVolume = `${project}-storage`;
  const temp = await mkdtemp(path.join(os.tmpdir(), "prelaunch-db-test-"));
  let container = "";
  const ownedVolumes: string[] = [];
  function docker(args: string[], input?: string | Buffer) {
    const result = spawnSync("docker", args, { env, input, encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Disposable database command failed (${args[0]})`);
    return result.stdout.trim();
  }
  function sql(statement: string) { return docker(["exec", "-i", container, "psql", "-U", "supabase_admin", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], statement); }
  try {
    const inspected = JSON.parse(docker(["image", "inspect", "postgres:17-alpine"]));
    const image = inspected[0].RepoDigests[0];
    for (const [volume, label] of [[pgVolume, "postgres-data"], [storageVolume, "storage-data"]]) {
      docker(["volume", "create", "--label", `com.docker.compose.project=${project}`, "--label", `com.docker.compose.volume=${label}`, volume]);
      ownedVolumes.push(volume);
    }
    container = docker(["run", "-d", "--network", "none", "--label", `com.docker.compose.project=${project}`, "--label", "com.docker.compose.service=postgres", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", "POSTGRES_USER=supabase_admin", "--env", "POSTGRES_DB=postgres", "--mount", `type=volume,source=${pgVolume},target=/var/lib/postgresql/data`, "--health-cmd", "pg_isready -U supabase_admin -d postgres", "--health-interval", "1s", "--health-start-period", "1s", image]);
    let healthy = false;
    for (let retry = 0; retry < 40; retry++) {
      if (JSON.parse(docker(["inspect", container]))[0].State.Health.Status === "healthy") { healthy = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(healthy).toBe(true);
    const repositoryRoot = path.join(temp, "repo");
    const migrationRoot = path.join(repositoryRoot, "supabase/migrations");
    await mkdir(migrationRoot, { recursive: true });
    const configPath = path.join(temp, "config.env");
    await writeFile(configPath, `FULL_LOCAL_COMPOSE_PROJECT_NAME=${project}\nFULL_LOCAL_POSTGRES_VOLUME_NAME=${pgVolume}\nFULL_LOCAL_STORAGE_VOLUME_NAME=${storageVolume}\nFULL_LOCAL_POSTGRES_IMAGE=${image}\n`, { mode: 0o600 });
    const baselinePath = path.join(temp, "baseline.json");
    await writeFile(baselinePath, JSON.stringify({ schema: "homecook.prelaunch-db-baseline.v1", verified: true, applied: [] }), { mode: 0o600 });
    const options = { repositoryRoot, configPath, baselinePath, backupRoot: path.join(temp, "backups") };
    const firstFile = "20260905010000_initial.sql";
    await writeFile(path.join(migrationRoot, firstFile), "BEGIN; CREATE TABLE public.prelaunch_example(id int primary key, title text); COMMIT;");
    const first = createPrelaunchDatabase(options);
    expect(await first.plan()).toMatchObject({ pending: [firstFile], baselineRequired: false });
    expect(await first.apply()).toMatchObject({ changed: true, applied: [firstFile] });
    expect(sql("SELECT count(*) FROM homecook_deploy.migrations;")).toBe("1");
    sql("INSERT INTO public.prelaunch_example VALUES (1,'retained sample');");
    const secondFile = "20260905020000_add_column.sql";
    await writeFile(path.join(migrationRoot, secondFile), "BEGIN; ALTER TABLE public.prelaunch_example ADD COLUMN published boolean DEFAULT false; COMMIT;");
    const second = createPrelaunchDatabase(options);
    const result = await second.apply();
    expect(result.applied).toEqual([secondFile]);
    expect(sql("SELECT count(*) FROM public.prelaunch_example WHERE NOT published;")).toBe("1");
    expect((await stat(result.backupPath)).mode & 0o777).toBe(0o600);
    sql("CREATE DATABASE backup_check;");
    docker(["exec", "-i", container, "pg_restore", "-U", "supabase_admin", "-d", "backup_check", "--exit-on-error"], await readFile(result.backupPath));
    expect(docker(["exec", container, "psql", "-U", "supabase_admin", "-d", "backup_check", "-Atqc", "SELECT count(*) FROM public.prelaunch_example;"])).toBe("1");
    expect(await second.apply()).toMatchObject({ changed: false });
    const thirdFile = "20260905030000_broken.sql";
    await writeFile(path.join(migrationRoot, thirdFile), "CREATE TABLE public.must_rollback(id int); ALTER TABLE public.does_not_exist ADD COLUMN x integer;");
    await expect(createPrelaunchDatabase(options).apply()).rejects.toMatchObject({ databaseState: { changed: false, outcome: "rolled_back", applied: [], attempted: [thirdFile] } });
    expect(sql("SELECT to_regclass('public.must_rollback') IS NULL;")).toBe("t");
    expect(sql("SELECT count(*) FROM homecook_deploy.migrations;")).toBe("2");
    expect(sql("SELECT count(*) FROM public.prelaunch_example;")).toBe("1");
    await writeFile(path.join(migrationRoot, thirdFile), "CREATE TABLE public.corrected_after_rollback(id int);");
    const corrected = createPrelaunchDatabase(options);
    expect(await corrected.apply()).toMatchObject({ changed: true, applied: [thirdFile], outcome: "committed" });
    expect(await corrected.apply()).toMatchObject({ changed: false });
    expect(sql("SELECT count(*) FROM homecook_deploy.migrations;")).toBe("3");
    await writeFile(path.join(migrationRoot, firstFile), "CREATE TABLE public.tampered(id int);");
    await expect(createPrelaunchDatabase(options).plan()).rejects.toThrow(/checksum changed/);
  } finally {
    if (container) docker(["rm", "--force", container]);
    for (const volume of ownedVolumes) docker(["volume", "rm", volume]);
    await rm(temp, { recursive: true, force: true });
  }
}, 120_000);
