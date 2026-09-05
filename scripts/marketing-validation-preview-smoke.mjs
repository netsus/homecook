#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCTION_HOSTNAMES = new Set([
  "app.mumeok.kr",
  "auth.mumeok.kr",
]);
const DIRECT_SERVICE_PATHS = [
  "/rest/v1/marketing_validation_sessions?select=id&limit=1",
  "/auth/v1/settings",
  "/studio",
  "/pgmeta/health",
];
const CLOSED_STATUSES = new Set([401, 403, 404]);

function pushBlocker(blockers, code) {
  if (!blockers.includes(code)) blockers.push(code);
}

function emptySummary() {
  return {
    schema: "homecook.marketing-validation-preview-smoke",
    version: 1,
    ready: false,
    preview_origin: null,
    blockers: [],
    checks: {
      landing: { ok: false, status: null },
      marketing_api: { ok: false, status: null },
      session_cookie: {
        ok: false,
        expected_name: false,
        expected_path: false,
        http_only: false,
        same_site_lax: false,
        secure: false,
      },
      origin_boundary: { ok: false, rejected_status: null },
      cors: { ok: false, absent_or_exact: false, exact_origin: false },
      direct_service_paths: { ok: false, exposed: [], results: [] },
    },
  };
}

function parsePreviewOrigin(rawOrigin, summary) {
  let parsed;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    pushBlocker(summary.blockers, "PREVIEW_ORIGIN_INVALID");
    return null;
  }
  if (parsed.origin !== rawOrigin || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    pushBlocker(summary.blockers, "PREVIEW_ORIGIN_INVALID");
    return null;
  }
  if (parsed.protocol !== "https:") {
    pushBlocker(summary.blockers, "PREVIEW_HTTPS_REQUIRED");
  }
  const normalizedHostname = parsed.hostname.toLowerCase().replace(/\.+$/u, "");
  if (PRODUCTION_HOSTNAMES.has(normalizedHostname)) {
    pushBlocker(summary.blockers, "PRODUCTION_ORIGIN_FORBIDDEN");
  }
  return parsed;
}

function cookieAttributes(setCookie) {
  const sessionCookie = typeof setCookie === "string"
    ? setCookie
      .split(/,(?=\s*[^=;,]+=[^;,]*)/u)
      .find((cookie) => /^\s*mumeok_validation_session=/u.test(cookie))
    : undefined;
  const parts = sessionCookie ? sessionCookie.split(";").map((part) => part.trim()) : [];
  const attributes = parts.slice(1);
  const hasFlag = (name) => attributes.some((attribute) => attribute.toLowerCase() === name);
  const hasAttribute = (name, expectedValue, { caseSensitiveValue = false } = {}) => (
    attributes.some((attribute) => {
      const separator = attribute.indexOf("=");
      if (separator < 1 || attribute.slice(0, separator).trim().toLowerCase() !== name) return false;
      const value = attribute.slice(separator + 1).trim();
      return caseSensitiveValue
        ? value === expectedValue
        : value.toLowerCase() === expectedValue.toLowerCase();
    })
  );
  return {
    expected_name: Boolean(sessionCookie),
    expected_path: hasAttribute("path", "/api/v1/marketing/validation", { caseSensitiveValue: true }),
    http_only: hasFlag("httponly"),
    same_site_lax: hasAttribute("samesite", "lax"),
    secure: hasFlag("secure"),
  };
}

/**
 * Run non-mutating public-boundary checks plus one anonymous `view` session write.
 * No email or Turnstile token is submitted by this smoke.
 *
 * @param {{
 *   previewOrigin: string,
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export async function collectMarketingValidationPreviewSmoke({
  previewOrigin,
  fetchImpl = fetch,
}) {
  const summary = emptySummary();
  const parsed = parsePreviewOrigin(previewOrigin, summary);
  if (parsed) summary.preview_origin = parsed.origin;
  if (!parsed || summary.blockers.length > 0) return summary;

  try {
    const landingResponse = await fetchImpl(new URL("/beta", parsed), {
      method: "GET",
      redirect: "manual",
    });
    summary.checks.landing.status = landingResponse.status;
    summary.checks.landing.ok = landingResponse.status >= 200 && landingResponse.status < 400;
    if (!summary.checks.landing.ok) pushBlocker(summary.blockers, "LANDING_UNAVAILABLE");

    const apiResponse = await fetchImpl(new URL("/api/v1/marketing/validation", parsed), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: parsed.origin,
      },
      body: JSON.stringify({ action: "view", honeypot: "" }),
      redirect: "manual",
    });
    summary.checks.marketing_api.status = apiResponse.status;
    summary.checks.marketing_api.ok = apiResponse.status === 200;
    if (!summary.checks.marketing_api.ok) pushBlocker(summary.blockers, "MARKETING_API_UNAVAILABLE");

    const cookie = cookieAttributes(apiResponse.headers.get("set-cookie"));
    Object.assign(summary.checks.session_cookie, cookie);
    summary.checks.session_cookie.ok = cookie.expected_name
      && cookie.expected_path
      && cookie.http_only
      && cookie.same_site_lax
      && cookie.secure;
    if (!cookie.expected_name) pushBlocker(summary.blockers, "SESSION_COOKIE_NAME_MISSING");
    if (!cookie.expected_path) pushBlocker(summary.blockers, "SESSION_COOKIE_PATH_INVALID");
    if (!cookie.http_only) pushBlocker(summary.blockers, "SESSION_COOKIE_HTTP_ONLY_MISSING");
    if (!cookie.same_site_lax) pushBlocker(summary.blockers, "SESSION_COOKIE_SAME_SITE_MISSING");
    if (!cookie.secure) pushBlocker(summary.blockers, "SESSION_COOKIE_SECURE_MISSING");

    const allowedOriginHeader = apiResponse.headers.get("access-control-allow-origin");
    summary.checks.cors.exact_origin = allowedOriginHeader === parsed.origin;
    summary.checks.cors.absent_or_exact = allowedOriginHeader === null
      || allowedOriginHeader === parsed.origin;
    summary.checks.cors.ok = summary.checks.cors.absent_or_exact;
    if (!summary.checks.cors.ok) pushBlocker(summary.blockers, "CORS_ORIGIN_UNSAFE");

    const wrongOriginResponse = await fetchImpl(
      new URL("/api/v1/marketing/validation", parsed),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.invalid",
        },
        body: JSON.stringify({ action: "view", honeypot: "" }),
        redirect: "manual",
      },
    );
    summary.checks.origin_boundary.rejected_status = wrongOriginResponse.status;
    summary.checks.origin_boundary.ok = wrongOriginResponse.status === 403;
    if (!summary.checks.origin_boundary.ok) {
      pushBlocker(summary.blockers, "WRONG_ORIGIN_NOT_REJECTED");
    }

    for (const servicePath of DIRECT_SERVICE_PATHS) {
      const serviceResponse = await fetchImpl(new URL(servicePath, parsed), {
        method: "GET",
        redirect: "manual",
      });
      summary.checks.direct_service_paths.results.push({
        path: servicePath,
        status: serviceResponse.status,
      });
      if (!CLOSED_STATUSES.has(serviceResponse.status)) {
        summary.checks.direct_service_paths.exposed.push(servicePath);
      }
    }
    summary.checks.direct_service_paths.ok = summary.checks.direct_service_paths.exposed.length === 0;
    if (!summary.checks.direct_service_paths.ok) {
      pushBlocker(summary.blockers, "DIRECT_SERVICE_PATH_EXPOSED");
    }
  } catch {
    pushBlocker(summary.blockers, "PREVIEW_REQUEST_FAILED");
  }

  summary.ready = summary.blockers.length === 0;
  return summary;
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--origin" || !argv[1]) return null;
  return argv[1];
}

/**
 * @param {{
 *   argv?: string[],
 *   fetchImpl?: typeof fetch,
 *   stdout?: (chunk: string) => void,
 *   stderr?: (chunk: string) => void,
 *   exit?: (code: number) => never,
 * }} [options]
 */
export async function runMarketingValidationPreviewSmokeCli({
  argv = process.argv.slice(2),
  fetchImpl = fetch,
  stdout = (chunk) => process.stdout.write(chunk),
  stderr = (chunk) => process.stderr.write(chunk),
  exit = (code) => process.exit(code),
} = {}) {
  const previewOrigin = parseArgs(argv);
  if (!previewOrigin) {
    stderr("usage: marketing-validation-preview-smoke --origin <https-preview-origin>\n");
    exit(1);
    return null;
  }
  const summary = await collectMarketingValidationPreviewSmoke({ previewOrigin, fetchImpl });
  stdout(`${JSON.stringify(summary)}\n`);
  if (!summary.ready) {
    stderr("marketing-validation-preview-smoke: FAIL (redacted)\n");
    exit(1);
  }
  return summary;
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  await runMarketingValidationPreviewSmokeCli();
}
