import { lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname } from "node:path";

import { describe, expect, it } from "vitest";

describe("Vitest run-owned temp boundary", () => {
  it("routes every worker os.tmpdir call into the private suite root", () => {
    const suiteRoot = process.env.HOMECOOK_VITEST_SUITE_TEMP_ROOT;
    const workerRoot = process.env.HOMECOOK_VITEST_WORKER_TEMP_ROOT;
    expect(suiteRoot).toMatch(/\/\.cache\/hcv\/r-[A-Za-z0-9_-]+$/u);
    expect(workerRoot).toBe(tmpdir());
    expect(dirname(workerRoot!)).toBe(suiteRoot);
    expect(basename(workerRoot!)).toMatch(/^w\d+-[A-Za-z0-9_-]+$/u);
    expect(realpathSync(suiteRoot!)).toBe(suiteRoot);
    expect(realpathSync(workerRoot!)).toBe(workerRoot);

    const stat = lstatSync(suiteRoot!);
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.uid).toBe(process.getuid?.());
    expect(stat.mode & 0o777).toBe(0o700);

    const workerStat = lstatSync(workerRoot!);
    expect(workerStat.isDirectory()).toBe(true);
    expect(workerStat.isSymbolicLink()).toBe(false);
    expect(workerStat.uid).toBe(process.getuid?.());
    expect(workerStat.mode & 0o777).toBe(0o700);
  });
});
