"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preload must remain CommonJS. */

const witnessPath = process.env.HOMECOOK_SANDBOX_WITNESS_MODULE;
if (!witnessPath) process.exit(125);
const witness = require(witnessPath);

const Module = require("node:module");
const originalModuleLoad = Module._load;
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
Module._load = function homecookOfflineModuleLoad(request, ...args) {
  if (request === "dns" || request === "node:dns") return offlineDns;
  if (request === "dns/promises" || request === "node:dns/promises") return offlineDnsPromises;
  return Reflect.apply(originalModuleLoad, this, [request, ...args]);
};

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
workerThreads.Worker.prototype.postMessage = function homecookWitnessedWorkerMessage(value, ...args) {
  return Reflect.apply(originalPostMessage, this, [sanitizeForWorkerThread(value), ...args]);
};
