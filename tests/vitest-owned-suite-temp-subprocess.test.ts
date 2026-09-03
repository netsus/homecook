import { existsSync, lstatSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, it } from "vitest";

const mode = process.env.HOMECOOK_VITEST_TEARDOWN_FIXTURE_MODE;

it.skipIf(mode === undefined)("exercises suite teardown in an independent Vitest process", async () => {
  const suiteRoot = process.env.HOMECOOK_VITEST_SUITE_TEMP_ROOT!;
  process.stdout.write(`VITEST_TEARDOWN_WORKER=${process.env.HOMECOOK_VITEST_WORKER_TEMP_ROOT}\n`);
  const sibling = join(dirname(suiteRoot), `${suiteRoot.split("/").at(-1)}-unrelated`);
  mkdirSync(sibling, { mode: 0o700 });
  process.stdout.write(`VITEST_TEARDOWN_SIBLING=${sibling}\n`);

  if (mode === "replacement") {
    const relocated = `${suiteRoot}.relocated`;
    renameSync(suiteRoot, relocated);
    process.stdout.write(`VITEST_TEARDOWN_RELOCATED=${relocated}\n`);
    mkdirSync(suiteRoot, { mode: 0o700 });
    const replacement = lstatSync(suiteRoot, { bigint: true });
    process.stdout.write(`VITEST_TEARDOWN_REPLACEMENT=${suiteRoot}:${replacement.dev}:${replacement.ino}\n`);
    return;
  }
  if (mode === "failure") {
    expect("actual").toBe("expected");
    return;
  }
  if (mode === "signal") {
    process.stdout.write("VITEST_TEARDOWN_READY=1\n");
    await new Promise(() => undefined);
  }
  expect(existsSync(suiteRoot)).toBe(true);
});
