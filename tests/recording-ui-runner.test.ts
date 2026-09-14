import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageUiRound2Migrations } from "../scripts/verify-marketing-round2-ui-isolated.mjs";
const names = ["20260911100000_marketing_round2.sql", "20260911110000_marketing_round2_linear_homeflow.sql", "20260911120000_marketing_round2_linear_recording.sql"];
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(count: number) {
  const root = await mkdtemp(join(tmpdir(), "recording-ui-migrations-")); roots.push(root);
  const directory = join(root, "supabase/migrations"); await mkdir(directory, { recursive: true });
  await Promise.all(names.slice(0, count).map((name, index) => writeFile(join(directory, name), `migration-${index}`)));
  await writeFile(join(directory, "unrelated.sql"), "keep");
  return { root, directory };
}
describe("R2 UI isolated migration ordering", () => {
  it("removes all three from fresh startup and returns the exact dependency order", async () => {
    const { root, directory } = await fixture(3);
    expect(await stageUiRound2Migrations(root)).toEqual(["migration-0", "migration-1", "migration-2"]);
    for (const name of names) await expect(readFile(join(directory, name))).rejects.toThrow();
    expect(await readFile(join(directory, "unrelated.sql"), "utf8")).toBe("keep");
  });
  it("does not partially detach migrations if one required source is missing", async () => {
    const { root, directory } = await fixture(2);
    await expect(stageUiRound2Migrations(root)).rejects.toThrow();
    expect(await readFile(join(directory, names[0]), "utf8")).toBe("migration-0");
  });
});
