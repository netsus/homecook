#!/usr/bin/env node
// An owned HTTPS fixture and isolated Chromium context. Never connects to the application or DB.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import ts from "typescript";
import { runRound2StorageScenarios } from "../tests/marketing-round2-session-browser.scenarios.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const owned = await mkdtemp(join(tmpdir(), "homecook-r2-storage-fixture-"));
const baseURL = "https://localhost:3443";
let server;
let browser;
try {
  await writeFile(join(owned, "openssl.cnf"), "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost\n", { mode: 0o600 });
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(owned, "key.pem"), "-out", join(owned, "cert.pem"), "-days", "1", "-config", join(owned, "openssl.cnf")], { stdio: "ignore" });
  const modules = new Map();
  for (const [path, source] of [["/session.js", "lib/marketing/round2-session.ts"], ["/protocol.js", "lib/marketing-round2.ts"]]) {
    const input = await readFile(join(root, source), "utf8");
    const output = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('"../marketing-round2"', '"/protocol.js"');
    modules.set(path, output);
  }
  server = createServer({ key: await readFile(join(owned, "key.pem")), cert: await readFile(join(owned, "cert.pem")) }, (request, response) => {
    if (request.headers.host !== "localhost:3443" || request.method !== "GET") { response.writeHead(403); response.end(); return; }
    response.setHeader("Cache-Control", "no-store");
    if (modules.has(request.url)) { response.setHeader("Content-Type", "application/javascript"); response.end(modules.get(request.url)); }
    else if (request.url === "/") { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>R2 isolated storage fixture</title>"); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(3443, "127.0.0.1", resolve); });
  browser = await chromium.launch({ headless: true });
  const result = await runRound2StorageScenarios(browser, baseURL);
  process.stdout.write(JSON.stringify({ ...result, origin: baseURL, productionAccess: 0, serverDatabaseAccess: 0 }, null, 2) + "\n");
} catch (error) {
  console.error(error instanceof Error ? error.message : "R2 browser storage verification failed");
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await rm(owned, { recursive: true, force: true });
}
