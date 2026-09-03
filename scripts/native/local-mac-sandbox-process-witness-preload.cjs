"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preload must remain CommonJS. */

const witnessPath = process.env.HOMECOOK_SANDBOX_WITNESS_MODULE;
if (!witnessPath) process.exit(125);
const workerThreadMode = process.env.HOMECOOK_SANDBOX_WORKER_THREAD === "1";
const witness = workerThreadMode
  ? Object.freeze({
      recordProcessAttempt(kind) {
        if (!/^[A-Za-z]+$/u.test(kind)) process.exit(125);
        require("node:fs").writeSync(4, `${JSON.stringify({ process_attempt: kind })}\n`);
      },
    })
  : require(witnessPath);
delete process.env.HOMECOOK_SANDBOX_WORKER_THREAD;
delete process.env.HOMECOOK_SANDBOX_WITNESS_FD;

const Module = require("node:module");
const offlineDnsProjectionEnabled = process.env.HOMECOOK_OFFLINE_DNS_PROJECTION === "1";
delete process.env.HOMECOOK_OFFLINE_DNS_PROJECTION;
const offlineDnsError = () => {
  witness.recordProcessAttempt("network");
  const error = new Error("offline release build attempted DNS access");
  error.code = "ENETUNREACH";
  throw error;
};
const offlineDnsPromiseError = async () => offlineDnsError();
class OfflineDnsResolver {
  constructor() {
    offlineDnsError();
  }
}
const offlineDnsPromises = new Proxy(Object.freeze({ Resolver: OfflineDnsResolver }), {
  get(target, property, receiver) {
    if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
    return offlineDnsPromiseError;
  },
});
const offlineDns = new Proxy(Object.freeze({
  ADDRCONFIG: 1024,
  ALL: 256,
  Resolver: OfflineDnsResolver,
  V4MAPPED: 2048,
  promises: offlineDnsPromises,
}), {
  get(target, property, receiver) {
    if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
    return offlineDnsError;
  },
});
if (offlineDnsProjectionEnabled) {
  const originalModuleLoad = Module._load;
  Module._load = function homecookOfflineModuleLoad(request, ...args) {
    if (request === "dns" || request === "node:dns") return offlineDns;
    if (request === "dns/promises" || request === "node:dns/promises") return offlineDnsPromises;
    return Reflect.apply(originalModuleLoad, this, [request, ...args]);
  };
  const originalGetBuiltinModule = process.getBuiltinModule.bind(process);
  process.getBuiltinModule = function homecookOfflineBuiltinModule(request) {
    if (request === "dns" || request === "node:dns") return offlineDns;
    if (request === "dns/promises" || request === "node:dns/promises") return offlineDnsPromises;
    return originalGetBuiltinModule(request);
  };
  const symbolName = "homecook.offlineDnsProjection";
  globalThis[Symbol.for(symbolName)] = Object.freeze({ dns: offlineDns, promises: offlineDnsPromises });
  const dnsExports = [
    "ADDRCONFIG", "ADDRGETNETWORKPARAMS", "ALL", "BADFAMILY", "BADFLAGS", "BADHINTS",
    "BADNAME", "BADQUERY", "BADRESP", "BADSTR", "CANCELLED", "CONNREFUSED", "DESTRUCTION",
    "EOF", "FILE", "FORMERR", "LOADIPHLPAPI", "NODATA", "NOMEM", "NONAME", "NOTFOUND",
    "NOTIMP", "NOTINITIALIZED", "REFUSED", "Resolver", "SERVFAIL", "TIMEOUT", "V4MAPPED",
    "getDefaultResultOrder", "getServers", "lookup", "lookupService", "resolve", "resolve4",
    "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs",
    "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse", "setDefaultResultOrder", "setServers",
  ];
  const moduleSource = (kind, exports) => {
    const projection = `globalThis[Symbol.for(${JSON.stringify(symbolName)})].${kind}`;
    return [
      `const projection=${projection};`,
      ...exports.map((name) => `export const ${name}=projection.${name};`),
      "export default projection;",
    ].join("\n");
  };
  const dnsSource = moduleSource("dns", [...dnsExports, "promises"]);
  const promisesSource = moduleSource("promises", dnsExports.filter((name) => ![
    "ADDRCONFIG", "ALL", "V4MAPPED", "promises",
  ].includes(name)));
  const loaderSource = [
    `const dnsUrl="data:text/javascript,"+encodeURIComponent(${JSON.stringify(dnsSource)});`,
    `const promisesUrl="data:text/javascript,"+encodeURIComponent(${JSON.stringify(promisesSource)});`,
    "export async function resolve(specifier, context, nextResolve) {",
    '  if (specifier === "dns" || specifier === "node:dns") return { url: dnsUrl, shortCircuit: true };',
    '  if (specifier === "dns/promises" || specifier === "node:dns/promises") return { url: promisesUrl, shortCircuit: true };',
    "  return nextResolve(specifier, context);",
    "}",
  ].join("\n");
  Module.register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, {
    parentURL: require("node:url").pathToFileURL(`${process.cwd()}/`).href,
  });
}

const childProcess = require("node:child_process");
for (const name of ["exec", "execFile", "execFileSync", "execSync", "fork", "spawn", "spawnSync"]) {
  const original = childProcess[name];
  childProcess[name] = function homecookWitnessedProcessAttempt(...args) {
    witness.recordProcessAttempt(name);
    return Reflect.apply(original, this, args);
  };
}

const originalKill = process.kill;
process.kill = function homecookWitnessedSignalAttempt(...args) {
  witness.recordProcessAttempt("signal");
  return Reflect.apply(originalKill, this, args);
};

const fs = require("node:fs");
for (const name of [
  "appendFileSync", "chmodSync", "chownSync", "copyFileSync", "linkSync", "mkdirSync",
  "mkdtempSync", "renameSync", "rmSync", "rmdirSync", "symlinkSync", "truncateSync",
  "unlinkSync", "writeFileSync",
]) {
  const original = fs[name];
  fs[name] = function homecookWitnessedFileOperation(...args) {
    try {
      return Reflect.apply(original, this, args);
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") witness.recordProcessAttempt("fileDeny");
      throw error;
    }
  };
}
const originalOpenSync = fs.openSync;
fs.openSync = function homecookWitnessedFileOpen(...args) {
  try {
    return Reflect.apply(originalOpenSync, this, args);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") witness.recordProcessAttempt("fileDeny");
    throw error;
  }
};

const net = require("node:net");
const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function homecookWitnessedNetworkAttempt(...args) {
  witness.recordProcessAttempt("network");
  return Reflect.apply(originalSocketConnect, this, args);
};

const workerThreads = require("node:worker_threads");
const originalPostMessage = workerThreads.Worker.prototype.postMessage;
function sanitizeForWorkerThread(value, seen = new WeakMap()) {
  if (typeof value === "function") return null;
  if (value === null || typeof value !== "object") return value;
  if (
    Buffer.isBuffer(value)
    || value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
    || value instanceof Date
    || value instanceof RegExp
    || value instanceof Map
    || value instanceof Set
  ) return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);
    for (const entry of value) output.push(sanitizeForWorkerThread(entry, seen));
    return output;
  }
  const output = {};
  seen.set(value, output);
  for (const [key, entry] of Object.entries(value)) {
    output[key] = sanitizeForWorkerThread(entry, seen);
  }
  return output;
}
if (offlineDnsProjectionEnabled) {
  const OriginalWorker = workerThreads.Worker;
  workerThreads.Worker = class HomecookOfflineDnsWorker extends OriginalWorker {
    constructor(filename, options = {}) {
      super(filename, {
        ...options,
        execArgv: [`--require=${__filename}`],
        env: {
          ...(options.env ?? process.env),
          HOMECOOK_OFFLINE_DNS_PROJECTION: "1",
          HOMECOOK_SANDBOX_WORKER_THREAD: "1",
          HOMECOOK_SANDBOX_WITNESS_FD: "4",
          HOMECOOK_SANDBOX_WITNESS_MODULE: witnessPath,
        },
      });
    }
  };
  Module.syncBuiltinESMExports();
} else {
  workerThreads.Worker.prototype.postMessage = function homecookWitnessedWorkerMessage(value, ...args) {
    return Reflect.apply(originalPostMessage, this, [sanitizeForWorkerThread(value), ...args]);
  };
}
