import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";

import { Round2Error } from "../marketing-round2";

const MAX_BYTES = 4 * 1024 * 1024;
const LIMITS = {
  ip: [60, 60],
  bootstrap: [20, 60],
  participation: [60, 60],
  lead_ip: [10, 3600],
  lead_participation: [5, 3600],
} as const;
export type Round2RateBucket = keyof typeof LIMITS;
export type Round2Control = {
  version: 1;
  collection_enabled: boolean;
  lead_enabled: boolean;
  consent_generation: number;
};
export type Round2ControlLease = {
  readControl(): Promise<Round2Control>;
  /** Approved operator runbooks only; never called by a public request. */
  writeControl(next: Round2Control): Promise<void>;
  /** Release only after a known commit/rollback, or verified matching receipt. */
  release(): Promise<void>;
};
type Counter = { count: number; window_end: number };
type State = { version: 1; counters: Record<string, Counter> };
type Options = {
  rateStateDir: string;
  controlPath: string;
  repositoryRoot: string;
  rateSecret: string;
  /** Epoch milliseconds, for isolated verification and fixed-window boundaries. */
  now?: () => number;
};

function unavailable(): never {
  throw new Round2Error("ROUND2_UNAVAILABLE");
}
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof Round2Error) throw error;
    return unavailable();
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function parseFile(text: string): unknown {
  const value: unknown = JSON.parse(text);
  // JSON.parse silently accepts duplicate keys. Validate keys at every object depth.
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/gu) ?? [];
  const stack: Array<Set<string> | null> = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "{") stack.push(new Set());
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ":") {
      const keys = stack[stack.length - 1];
      const key = JSON.parse(token) as string;
      if (!keys || keys.has(key)) unavailable();
      keys.add(key);
    }
  }
  return value;
}
function control(value: unknown): Round2Control {
  if (!exact(value, ["version", "collection_enabled", "lead_enabled", "consent_generation"]) ||
    value.version !== 1 || typeof value.collection_enabled !== "boolean" || typeof value.lead_enabled !== "boolean" ||
    !integer(value.consent_generation) || value.consent_generation < 1 || value.consent_generation > 2147483647) unavailable();
  return value as Round2Control;
}
function state(value: unknown, now: number): State {
  if (!exact(value, ["version", "counters"]) || value.version !== 1 || !object(value.counters)) unavailable();
  for (const [key, counter] of Object.entries(value.counters)) {
    if (!/^[a-f0-9]{64}$/u.test(key) || !exact(counter, ["count", "window_end"]) ||
      !integer(counter.count) || counter.count < 1 || counter.count > 60 ||
      !integer(counter.window_end) || counter.window_end % 60 !== 0 || counter.window_end > now + 3600) unavailable();
  }
  return value as State;
}

/** No initialization or orphan recovery exists in the collector adapter. */
export function createRound2FileStorage(options: Options) {
  const now = options.now ?? Date.now;
  async function validateDirectory(directory: string) {
    if (!isAbsolute(directory) || resolve(directory) !== directory || !isAbsolute(options.repositoryRoot)) unavailable();
    const repositoryRoot = await fs.realpath(options.repositoryRoot);
    const rel = relative(repositoryRoot, directory);
    if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) unavailable();
    // Reject a symlink in any component, not just the final file.
    let current = parse(directory).root;
    for (const component of directory.slice(current.length).split(sep).filter(Boolean)) {
      current = join(current, component);
      if ((await fs.lstat(current)).isSymbolicLink()) unavailable();
    }
    const info = await fs.lstat(directory);
    if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700) unavailable();
    const { type } = await fs.statfs(directory);
    const localTypes = process.platform === "darwin" ? [17, 26] :
      process.platform === "linux" ? [0xef53, 0x01021994, 0x58465342, 0x9123683e, 0x794c7630, 0x2fc12fc1] : [];
    if (!localTypes.includes(type >>> 0)) unavailable();
    return info;
  }
  async function readFile(path: string, max = MAX_BYTES) {
    if (!isAbsolute(path) || resolve(path) !== path) unavailable();
    await validateDirectory(dirname(path));
    const before = await fs.lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.uid !== process.getuid?.() ||
      (before.mode & 0o777) !== 0o600 || before.size > max) unavailable();
    const file = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const actual = await file.stat();
      if (actual.ino !== before.ino || actual.dev !== before.dev) unavailable();
      // Bounded even if an approved operator changes the file while being read.
      const buffer = Buffer.alloc(max + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      if (offset > max) unavailable();
      return buffer.subarray(0, offset).toString("utf8");
    } finally { await file.close(); }
  }
  async function replaceFile(path: string, value: unknown) {
    const directory = dirname(path);
    const before = await validateDirectory(directory);
    // Existing state is mandatory; loss is never interpreted as an empty state.
    await readFile(path);
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length > MAX_BYTES) unavailable();
    const temporary = join(directory, `.r2-${randomBytes(24).toString("hex")}.tmp`);
    const file = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally { await file.close(); }
    try {
      const actual = await validateDirectory(directory);
      if (actual.ino !== before.ino || actual.dev !== before.dev) unavailable();
      await fs.rename(temporary, path);
      const dir = await fs.open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { await dir.sync(); } finally { await dir.close(); }
    } finally { await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }
  }
  async function acquire(path: string) {
    await validateDirectory(dirname(path));
    const started = performance.now();
    while (true) {
      try { await fs.mkdir(path, { mode: 0o700 }); break; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (performance.now() - started >= 250) unavailable();
        await new Promise((done) => setTimeout(done, Math.min(25, Math.max(1, 250 - (performance.now() - started)))));
      }
    }
    const info = await fs.lstat(path);
    const token = randomBytes(32).toString("hex");
    const ownerPath = join(path, "owner");
    await fs.writeFile(ownerPath, token, { mode: 0o600, flag: "wx" });
    let released = false;
    async function assertOwner() {
      if (released) unavailable();
      await validateDirectory(path);
      const current = await fs.lstat(path);
      if (info.ino !== current.ino || info.dev !== current.dev) unavailable();
      const owner = await readFile(ownerPath, 64);
      if (owner.length !== token.length || !timingSafeEqual(Buffer.from(owner), Buffer.from(token))) unavailable();
    }
    return {
      assertOwner,
      async release() {
        await assertOwner();
        await fs.unlink(ownerPath);
        await fs.rmdir(path);
        released = true;
      },
    };
  }

  return {
    async consumeRate(input: { ip: string; participationId?: string; buckets: Round2RateBucket[] }): Promise<void> {
      return safe(async () => {
        if (!input.ip || !options.rateSecret || Buffer.byteLength(options.rateSecret) < 32 || input.buckets.length === 0 ||
          new Set(input.buckets).size !== input.buckets.length) unavailable();
        for (const bucket of input.buckets) {
          if (!Object.hasOwn(LIMITS, bucket) || (bucket.includes("participation") &&
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(input.participationId ?? ""))) unavailable();
        }
        const lease = await acquire(join(options.rateStateDir, "rate.lock"));
        try {
          const seconds = Math.floor(now() / 1000);
          if (!integer(seconds)) unavailable();
          const path = join(options.rateStateDir, "state.json");
          const current = state(parseFile(await readFile(path)), seconds);
          for (const [key, value] of Object.entries(current.counters)) if (value.window_end <= seconds) delete current.counters[key];
          let retryAfter = 0;
          for (const bucket of input.buckets) {
            const [limit, window] = LIMITS[bucket];
            const day = new Date(seconds * 1000).toISOString().slice(0, 10);
            const subject = bucket.includes("participation") ? input.participationId : input.ip;
            const key = createHmac("sha256", options.rateSecret).update(JSON.stringify({ bucket, day, subject })).digest("hex");
            const end = (Math.floor(seconds / window) + 1) * window;
            const counter = current.counters[key] ?? { count: 0, window_end: end };
            if (counter.window_end !== end || counter.count > limit) unavailable();
            if (counter.count >= limit) retryAfter = Math.max(retryAfter, end - seconds);
            counter.count = Math.min(limit, counter.count + 1);
            current.counters[key] = counter;
          }
          await lease.assertOwner();
          await replaceFile(path, current);
          if (retryAfter) throw new Round2Error("RATE_LIMITED", [], retryAfter);
        } finally { await lease.release(); }
      });
    },
    async readControl(): Promise<Round2Control> {
      return safe(async () => control(parseFile(await readFile(options.controlPath))));
    },
    async acquireControlLease(): Promise<Round2ControlLease> {
      return safe(async () => {
        if (!isAbsolute(options.controlPath) || resolve(options.controlPath) !== options.controlPath) unavailable();
        const lease = await acquire(`${options.controlPath}.lock`);
        return {
          readControl: () => safe(async () => { await lease.assertOwner(); return control(parseFile(await readFile(options.controlPath))); }),
          writeControl: (next) => safe(async () => {
            await lease.assertOwner();
            const old = control(parseFile(await readFile(options.controlPath)));
            const checked = control(next);
            if (checked.consent_generation < old.consent_generation) unavailable();
            await replaceFile(options.controlPath, checked);
          }),
          release: () => safe(() => lease.release()),
        };
      });
    },
  };
}
