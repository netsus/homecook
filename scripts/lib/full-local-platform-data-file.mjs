import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readSync, rmSync, statSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { buildSanitizedPlatformData, inventoryPlatformDataRelations } from "./full-local-restore-cutover.mjs";

const TABLE_DATA_COMMENT = /^-- Data for Name: [^;]+; Type: TABLE DATA; Schema: [^;]+; Owner: [^;]+$/u;
const STATEMENT_LIMIT = 1024 * 1024;
// COPY can repack heap rows without changing their contents. This explicit
// contract preserves duplicate row fingerprints; unmarked archives keep the
// original ordered digest, and the archive's byte checksum remains unchanged.
export const PLATFORM_DATA_SEMANTIC_FORMAT = "copy-row-sha256-multiset-v1";

function consumeFile(path, consume) {
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let size;
    while ((size = readSync(fd, buffer)) > 0) consume(buffer.subarray(0, size));
  } finally {
    closeSync(fd);
  }
}

export function hashPlatformFile(path) {
  const hash = createHash("sha256");
  consumeFile(path, (chunk) => hash.update(chunk));
  return hash.digest("hex");
}

export function writePlatformRestoreFile({ dataPath, rolesPath, schemaPath, output }) {
  for (const path of [rolesPath, schemaPath, dataPath]) {
    if (!statSync(path).isFile() || statSync(path).size === 0) throw new Error("Platform restore component is empty");
  }
  const fd = openSync(output, "wx", 0o600);
  try {
    writeSync(fd, "\\set ON_ERROR_STOP on\n");
    for (const path of [rolesPath, schemaPath]) {
      consumeFile(path, (chunk) => writeSync(fd, chunk));
      writeSync(fd, "\n");
    }
    writeSync(fd, "SET session_replication_role = replica;\n");
    consumeFile(dataPath, (chunk) => writeSync(fd, chunk));
    writeSync(fd, "\nSET session_replication_role = origin;\n");
  } finally {
    closeSync(fd);
  }
}

// COPY escapes embedded newlines. Decode complete UTF-8 characters, but never
// accumulate a data row: a single large JSON/text column can exceed V8's limit.
function walkCopyFile(path, visitor) {
  const decoder = new StringDecoder("utf8");
  let header = "";
  let inCopy = false;
  let rowPrefix = "";
  let rowStarted = false;
  const fragment = (text) => {
    if (!inCopy) {
      header += text;
      if (header.length > STATEMENT_LIMIT) throw new Error("Platform SQL statement exceeds the safe header limit");
    } else if (rowStarted) {
      visitor.rowChunk(text);
    } else {
      // Only the exact two-character line \\. terminates COPY.
      if (rowPrefix.length + text.length >= 3) {
        visitor.rowStart();
        visitor.rowChunk(rowPrefix);
        visitor.rowChunk(text);
        rowPrefix = "";
        rowStarted = true;
      } else rowPrefix += text;
    }
  };
  const endLine = () => {
    if (!inCopy) {
      if (header.startsWith("COPY ")) {
        const [relation] = inventoryPlatformDataRelations(`${header}\n\\.`);
        visitor.copyStart(header, relation);
        inCopy = true;
      } else visitor.statement(header);
      header = "";
    } else if (!rowStarted && rowPrefix === "\\.") {
      visitor.copyEnd();
      inCopy = false;
    } else {
      if (!rowStarted) {
        visitor.rowStart();
        visitor.rowChunk(rowPrefix);
      }
      visitor.rowEnd();
    }
    rowPrefix = "";
    rowStarted = false;
  };
  const decoded = (text) => {
    let start = 0;
    let end;
    while ((end = text.indexOf("\n", start)) !== -1) {
      fragment(text.slice(start, end));
      endLine();
      start = end + 1;
    }
    fragment(text.slice(start));
  };
  consumeFile(path, (chunk) => decoded(decoder.write(chunk)));
  decoded(decoder.end());
  endLine(); // Preserve split("\n")'s final empty line in the semantic digest.
  if (inCopy) throw new Error("Unterminated COPY block in platform data");
}

function processPlatformDataFile(input, output, diagnostics = false, semanticFormat) {
  if (semanticFormat !== undefined && semanticFormat !== PLATFORM_DATA_SEMANTIC_FORMAT) throw new Error("Unsupported platform data semantic format");
  const multiset = semanticFormat === PLATFORM_DATA_SEMANTIC_FORMAT;
  const temp = mkdtempSync(join(tmpdir(), "homecook-platform-data-"));
  const blocks = [];
  const relations = [];
  const serviceLedgers = {};
  const openFiles = new Set();
  const open = (path) => {
    const fd = openSync(path, "wx", 0o600);
    openFiles.add(fd);
    return fd;
  };
  const close = (fd) => { closeSync(fd); openFiles.delete(fd); };
  const escaped = (text) => JSON.stringify(text).slice(1, -1);
  let outputCreated = false;
  try {
    const target = output ? open(output) : null;
    outputCreated = output !== undefined;
    const nonCopyPath = join(temp, "non-copy.json-fragment");
    const nonCopy = open(nonCopyPath);
    let outputLines = 0;
    let nonCopyLines = 0;
    let active;
    let restrict;
    let unrestrict;
    const line = (text) => {
      if (target === null) return;
      if (outputLines++) writeSync(target, "\n");
      writeSync(target, text);
    };
    const blockWrite = (text) => {
      if (!active.include) return;
      writeSync(active.fd, text);
    };
    walkCopyFile(input, {
      statement(text) {
        line(text);
        if (text.startsWith("\\restrict")) {
          const match = /^\\restrict\s+([A-Za-z0-9]+)\s*$/u.exec(text);
          if (!match || restrict || unrestrict) throw new Error("Invalid pg_dump restrict pair");
          restrict = match[1];
          return;
        }
        if (text.startsWith("\\unrestrict")) {
          const match = /^\\unrestrict\s+([A-Za-z0-9]+)\s*$/u.exec(text);
          if (!match || unrestrict || !restrict || restrict !== match[1]) throw new Error("Invalid pg_dump restrict pair");
          unrestrict = match[1];
          return;
        }
        if (TABLE_DATA_COMMENT.test(text)) return;
        if (nonCopyLines++) writeSync(nonCopy, "\\n");
        writeSync(nonCopy, escaped(text));
      },
      copyStart(header, parsed) {
        // Reuse the existing allowlist/classifier and column parser unchanged.
        const template = output ? buildSanitizedPlatformData(`${header}\n\\.`).manifest : null;
        const relation = { ...(template?.relations[0] ?? parsed), row_count: 0 };
        const include = !output || relation.action === "include";
        active = { relation, include, ledger: Object.keys(template?.service_ledgers ?? {})[0] };
        relations.push(relation);
        if (!include) return;
        line(header);
        const path = join(temp, `copy-${blocks.length}.json`);
        active.fd = open(path);
        blocks.push({ path, relation: relation.relation });
        const prefix = `{"columns":${JSON.stringify(relation.columns)},"relation":${JSON.stringify(relation.relation)},`;
        if (active.ledger) active.ledgerHash = createHash("sha256").update(`${prefix}"rows":[`);
        blockWrite(`${prefix}"${multiset ? "row_sha256" : "rows"}":[`);
        if (multiset) {
          active.rowHashPath = `${path}.row-hashes`;
          active.rowHashFd = open(active.rowHashPath);
        }
      },
      rowStart() {
        const index = active.relation.row_count++;
        if (!active.include) return;
        line("");
        if (active.ledgerHash) active.ledgerHash.update(`${index ? "," : ""}"`);
        if (multiset) active.rowHash = createHash("sha256");
        else {
          if (index) blockWrite(",");
          blockWrite('"');
        }
      },
      rowChunk(text) {
        if (active.include && target !== null) writeSync(target, text);
        if (!active.include) return;
        if (multiset) active.rowHash.update(text);
        else blockWrite(escaped(text));
        if (active.ledgerHash) active.ledgerHash.update(escaped(text));
      },
      rowEnd() {
        if (!active.include) return;
        if (multiset) writeSync(active.rowHashFd, `${active.rowHash.digest("hex")}\n`);
        else blockWrite('"');
        if (active.ledgerHash) active.ledgerHash.update('"');
      },
      copyEnd() {
        if (active.include) {
          line("\\.");
          if (multiset) {
            close(active.rowHashFd);
            const sortedPath = `${active.rowHashPath}.sorted`;
            const sortedFd = open(sortedPath);
            const result = spawnSync("/usr/bin/sort", ["-S", "16M", "-T", temp, active.rowHashPath], {
              env: { ...process.env, LC_ALL: "C" }, stdio: ["ignore", sortedFd, "pipe"], maxBuffer: 1024 * 1024,
            });
            close(sortedFd);
            if (result.status !== 0 || result.error) throw new Error("Platform row digest sorting failed");
            let count = 0;
            walkCopyFile(sortedPath, {
              statement(rowHash) {
                if (rowHash === "") return;
                if (!/^[0-9a-f]{64}$/u.test(rowHash)) throw new Error("Invalid sorted platform row digest");
                blockWrite(`${count++ ? "," : ""}${JSON.stringify(rowHash)}`);
              },
              copyStart() { throw new Error("Invalid sorted platform row digest"); },
            });
            if (count !== active.relation.row_count) throw new Error("Sorted platform row count changed");
          }
          blockWrite("]}");
          close(active.fd);
          if (active.ledger) serviceLedgers[active.ledger] = {
            digest_sha256: active.ledgerHash.update("]}").digest("hex"), row_count: active.relation.row_count,
          };
        }
        active = undefined;
      },
    });
    if (restrict !== unrestrict) throw new Error("Invalid pg_dump restrict pair");
    close(nonCopy);
    if (target !== null) close(target);
    const hash = createHash("sha256").update('{"copy_blocks":[');
    blocks.sort((left, right) => left.relation.localeCompare(right.relation));
    for (const [index, block] of blocks.entries()) {
      if (index && blocks[index - 1].relation === block.relation) throw new Error("Duplicate platform data relation is not allowed");
      if (index) hash.update(",");
      consumeFile(block.path, (chunk) => hash.update(chunk));
    }
    hash.update('],"non_copy_sql":"');
    consumeFile(nonCopyPath, (chunk) => hash.update(chunk));
    const dataSemanticSha256 = hash.update('"}').digest("hex");
    if (!output) return diagnostics ? {
      data_semantic_sha256: dataSemanticSha256,
      non_copy_sha256: hashPlatformFile(nonCopyPath),
      relations: blocks.map((block) => ({ relation: block.relation, sha256: hashPlatformFile(block.path) })),
    } : dataSemanticSha256;
    const classification = relations.map(({ action, columns, relation }) => ({ action, columns, relation }))
      .sort((left, right) => left.relation.localeCompare(right.relation) || JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return {
      ...(multiset ? { data_semantic_format: PLATFORM_DATA_SEMANTIC_FORMAT } : {}),
      data_semantic_sha256: dataSemanticSha256,
      relation_classification_digest: createHash("sha256").update(JSON.stringify(classification)).digest("hex"),
      relations,
      service_ledgers: serviceLedgers,
      transient_promote_count: 0,
      unclassified: [],
    };
  } catch (error) {
    if (outputCreated) rmSync(output, { force: true });
    throw error;
  } finally {
    for (const fd of openFiles) closeSync(fd);
    rmSync(temp, { recursive: true, force: true });
  }
}

export const sanitizePlatformDataFile = (input, output, semanticFormat) => processPlatformDataFile(input, output, false, semanticFormat);
export const digestSemanticPlatformDataFile = (input, semanticFormat) => processPlatformDataFile(input, undefined, false, semanticFormat);
export const inspectSemanticPlatformDataFile = (input, semanticFormat) => processPlatformDataFile(input, undefined, true, semanticFormat);
