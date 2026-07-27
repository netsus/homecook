import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

import {
  ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT,
  ACCOUNT_MAINTENANCE_KEYCHAIN_READ_SWIFT,
  ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE,
} from "./account-maintenance-live.mjs";

const PENDING_KEYCHAIN_ACCOUNT =
  `${ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT}_PENDING_ROTATION`;

const KEYCHAIN_WRITE_SWIFT = `
import Darwin
import Foundation
import Security

guard
  let service = ProcessInfo.processInfo.environment["HOMECOOK_KEYCHAIN_SERVICE"],
  let account = ProcessInfo.processInfo.environment["HOMECOOK_KEYCHAIN_ACCOUNT"]
else {
  exit(64)
}

let secret = FileHandle.standardInput.readDataToEndOfFile()
guard secret.count >= 43 else {
  exit(65)
}

let query: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrService as String: service,
  kSecAttrAccount as String: account,
]
let attributes: [String: Any] = [
  kSecValueData as String: secret,
]

var status = SecItemUpdate(
  query as CFDictionary,
  attributes as CFDictionary
)
if status == errSecItemNotFound {
  var item = query
  item[kSecValueData as String] = secret
  status = SecItemAdd(item as CFDictionary, nil)
}
guard status == errSecSuccess else {
  exit(1)
}
`;

const KEYCHAIN_DELETE_SWIFT = `
import Darwin
import Foundation
import Security

guard
  let service = ProcessInfo.processInfo.environment["HOMECOOK_KEYCHAIN_SERVICE"],
  let account = ProcessInfo.processInfo.environment["HOMECOOK_KEYCHAIN_ACCOUNT"]
else {
  exit(64)
}

let query: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrService as String: service,
  kSecAttrAccount as String: account,
]
let status = SecItemDelete(query as CFDictionary)
guard status == errSecSuccess || status == errSecItemNotFound else {
  exit(1)
}
`;

function requireSuccess(result, operation) {
  if (result?.status !== 0) {
    throw new Error(`Account maintenance secret rotation failed during ${operation}.`);
  }
  return result;
}

function normalizeExactCommit(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error("expectedCommit must be an exact 40-character Git SHA");
  }
  return value;
}

function defaultRun(file, args, options = {}) {
  return spawnSync(file, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...options.env,
      NO_COLOR: "1",
    },
  });
}

function writeKeychainSecret({ account, secret, run }) {
  requireSuccess(
    run(
      "/usr/bin/swift",
      ["-e", KEYCHAIN_WRITE_SWIFT],
      {
        input: secret,
        env: {
          HOMECOOK_KEYCHAIN_SERVICE:
            ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE,
          HOMECOOK_KEYCHAIN_ACCOUNT: account,
        },
      },
    ),
    "Keychain update",
  );
}

function readPendingKeychainSecret(run) {
  const result = run(
    "/usr/bin/swift",
    ["-e", ACCOUNT_MAINTENANCE_KEYCHAIN_READ_SWIFT],
    {
      env: {
        HOMECOOK_KEYCHAIN_SERVICE:
          ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE,
        HOMECOOK_KEYCHAIN_ACCOUNT: PENDING_KEYCHAIN_ACCOUNT,
      },
    },
  );
  if (result?.status === 44) {
    return null;
  }
  requireSuccess(result, "pending Keychain lookup");
  const secret = result.stdout?.trim();
  if (typeof secret !== "string" || secret.length < 43) {
    throw new Error("Pending Keychain rotation secret is invalid.");
  }
  return secret;
}

/**
 * @param {{
 *   confirmed: boolean,
 *   expectedCommit: string,
 *   rootDir: string,
 *   vercelCwd: string,
 *   vercelCommand?: string,
 *   vercelArgsPrefix?: string[],
 *   generateSecret?: () => string,
 *   run?: (file: string, args: string[], options?: {
 *     cwd?: string,
 *     input?: string,
 *     env?: Record<string, string>,
 *   }) => { status: number | null, stdout?: string, stderr?: string },
 * }} options
 */
export function rotateAccountMaintenanceSecret({
  confirmed,
  expectedCommit,
  rootDir,
  vercelCwd,
  vercelCommand = "vercel",
  vercelArgsPrefix = [],
  generateSecret = () => randomBytes(48).toString("base64url"),
  run = defaultRun,
}) {
  if (!confirmed) {
    throw new Error("Manual Only confirmation is required for secret rotation.");
  }
  const exactCommit = normalizeExactCommit(expectedCommit);
  const head = requireSuccess(
    run("git", ["rev-parse", "HEAD"], { cwd: rootDir }),
    "HEAD verification",
  ).stdout?.trim();
  const master = requireSuccess(
    run("git", ["rev-parse", "origin/master"], { cwd: rootDir }),
    "origin/master verification",
  ).stdout?.trim();
  if (head !== exactCommit || master !== exactCommit) {
    throw new Error("Secret rotation requires the exact merged origin/master commit.");
  }

  requireSuccess(
    run(
      vercelCommand,
      [...vercelArgsPrefix, "whoami", "--cwd", vercelCwd, "--no-color"],
      { cwd: vercelCwd },
    ),
    "Vercel authentication preflight",
  );
  requireSuccess(
    run(
      vercelCommand,
      [
        ...vercelArgsPrefix,
        "env",
        "ls",
        "production",
        "--cwd",
        vercelCwd,
        "--no-color",
      ],
      { cwd: vercelCwd },
    ),
    "Vercel project preflight",
  );
  requireSuccess(
    run("/usr/bin/swift", ["--version"]),
    "Keychain capability preflight",
  );

  const pendingSecret = readPendingKeychainSecret(run);
  const secret = pendingSecret ?? generateSecret();
  const secretGenerated = pendingSecret === null;
  if (typeof secret !== "string" || secret.length < 43) {
    throw new Error("Generated account maintenance secret is too short.");
  }

  if (secretGenerated) {
    writeKeychainSecret({
      account: PENDING_KEYCHAIN_ACCOUNT,
      secret,
      run,
    });
  }
  requireSuccess(
    run(
      vercelCommand,
      [
        ...vercelArgsPrefix,
        "env",
        "add",
        ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT,
        "production",
        "--force",
        "--sensitive",
        "--cwd",
        vercelCwd,
        "--no-color",
      ],
      { cwd: vercelCwd, input: secret },
    ),
    "Vercel production update",
  );
  writeKeychainSecret({
    account: ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT,
    secret,
    run,
  });
  requireSuccess(
    run(
      "/usr/bin/swift",
      ["-e", KEYCHAIN_DELETE_SWIFT],
      {
        env: {
          HOMECOOK_KEYCHAIN_SERVICE:
            ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE,
          HOMECOOK_KEYCHAIN_ACCOUNT: PENDING_KEYCHAIN_ACCOUNT,
        },
      },
    ),
    "Keychain rotation cleanup",
  );

  return {
    ok: true,
    exactCommit,
    keychainUpdated: true,
    vercelProductionUpdated: true,
    secretGenerated,
    secretExposed: false,
  };
}
