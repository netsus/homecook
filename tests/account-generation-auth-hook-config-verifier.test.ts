import { describe, expect, it, vi } from "vitest";

const EXPECTED_URI =
  "pg-functions://postgres/account_generation_auth_hook/before_user_created";

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    async json() {
      return body;
    },
  };
}

describe("account generation auth hook config verifier", () => {
  it("verifies the exact before-user-created hook configuration through a GET-only safe summary", async () => {
    const verifier = await import(
      "../scripts/lib/account-generation-auth-hook-config-verifier.mjs"
    );

    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        hook_before_user_created_enabled: true,
        hook_before_user_created_uri: EXPECTED_URI,
        hook_secret: "must-not-leak",
      }),
    );

    const result = await verifier.verifyAccountGenerationAuthHookConfig({
      projectRef: "abcdefghijklmnopqrst",
      accessToken: "super-secret-token",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/config/auth",
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        headers: {
          Authorization: "Bearer super-secret-token",
          Accept: "application/json",
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result).toEqual({
      ok: true,
      readOnly: true,
      remoteWrites: 0,
      authHookConfigured: true,
      beforeUserCreatedHook: {
        enabled: true,
        uriMatchesExpected: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("abcdefghijklmnopqrst");
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });

  it("strictly decodes the Supabase CLI macOS keychain fallback secret", async () => {
    const verifier = await import(
      "../scripts/lib/account-generation-auth-hook-config-verifier.mjs"
    );

    expect(
      verifier.parseSupabaseCliAccessTokenKeychainSecret(
        "default:c3VwYWJhc2UtdG9rZW4",
      ),
    ).toBe("supabase-token");
    expect(
      verifier.parseSupabaseCliAccessTokenKeychainSecret(
        "default:c3VwYWJhc2UtdG9rZW4=",
      ),
    ).toBe("supabase-token");

    expect(() =>
      verifier.parseSupabaseCliAccessTokenKeychainSecret("missing-colon"),
    ).toThrow("Supabase CLI keychain secret is malformed");
    expect(() =>
      verifier.parseSupabaseCliAccessTokenKeychainSecret("default:not-base64url*"),
    ).toThrow("Supabase CLI keychain secret is malformed");
    expect(() =>
      verifier.parseSupabaseCliAccessTokenKeychainSecret(
        "default:c3Vw=YWJhc2UtdG9rZW4",
      ),
    ).toThrow("Supabase CLI keychain secret is malformed");
    expect(() =>
      verifier.parseSupabaseCliAccessTokenKeychainSecret(
        "default:c3VwYWJhc2UtdG9rZW4===",
      ),
    ).toThrow("Supabase CLI keychain secret is malformed");
  });

  it("reads the linked project ref and prefers env token before the macOS keychain fallback", async () => {
    const verifier = await import(
      "../scripts/lib/account-generation-auth-hook-config-verifier.mjs"
    );

    const readFile = vi.fn(() => "abcdefghijklmnopqrst\n");
    expect(
      verifier.resolveAccountGenerationProjectRef({
        cwd: "/repo",
        readFile,
      }),
    ).toBe("abcdefghijklmnopqrst");
    expect(readFile).toHaveBeenCalledWith("/repo/supabase/.temp/project-ref", "utf8");

    expect(
      verifier.resolveAccountGenerationProjectRef({
        cwd: "/repo",
        readFile: () => "abcdefghijklmnopqrst\n",
      }),
    ).toBe("abcdefghijklmnopqrst");

    expect(
      verifier.resolveSupabaseManagementAccessToken({
        env: { SUPABASE_ACCESS_TOKEN: "env-token" },
        platform: "darwin",
        readKeychainSecret: () => "default:c2hvdWxkLW5vdC11c2U",
      }),
    ).toBe("env-token");

    expect(
      verifier.resolveSupabaseManagementAccessToken({
        env: {},
        platform: "darwin",
        readKeychainSecret: () => "default:c3VwYWJhc2UtdG9rZW4",
      }),
    ).toBe("supabase-token");
  });

  it("uses the fixed /usr/bin/security path for the macOS keychain fallback", async () => {
    const cli = await import(
      "../scripts/verify-account-generation-auth-hook-config.mjs"
    );

    const execFileSyncImpl = vi.fn(() => "default:c3VwYWJhc2UtdG9rZW4\n");
    const spawnSyncImpl = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
      .mockReturnValueOnce({
        status: 0,
        stdout: "420177f57f4b19d3c4403393c27b5ec6fa3dd1\n",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "420177f57f4b19d3c4403393c27b5ec6fa3dd1\n",
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" });

    const exitCode = await cli.runAccountGenerationAuthHookConfigVerification({
      cwd: "/repo",
      env: {},
      platform: "darwin",
      execFileSyncImpl,
      fetchImpl: async () =>
        jsonResponse({
          hook_before_user_created_enabled: true,
          hook_before_user_created_uri: EXPECTED_URI,
        }),
      spawnSyncImpl,
      resolveLinkedRoot: () => "/linked-root",
      readFile: () => "abcdefghijklmnopqrst\n",
      stdout: { write: () => {} },
      stderr: { write: () => {} },
    });

    expect(exitCode).toBe(0);
    expect(execFileSyncImpl).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["find-generic-password", "-w", "-s", "Supabase CLI", "-a", "supabase"],
      { encoding: "utf8" },
    );
  });

  it("fails closed when the linked root project-ref file is missing", async () => {
    const verifier = await import(
      "../scripts/lib/account-generation-auth-hook-config-verifier.mjs"
    );

    expect(() =>
      verifier.resolveAccountGenerationProjectRef({
        cwd: "/repo",
        readFile: () => {
          throw new Error("missing linked project-ref");
        },
      }),
    ).toThrow("missing linked project-ref");
  });

  it("fails closed on malformed project refs, non-200 responses, disabled hooks, wrong URIs, and malformed payloads", async () => {
    const verifier = await import(
      "../scripts/lib/account-generation-auth-hook-config-verifier.mjs"
    );

    expect(() =>
      verifier.resolveAccountGenerationProjectRef({
        cwd: "/repo",
        readFile: () => "ignored",
      }),
    ).toThrow("Supabase project ref is invalid");

    await expect(
      verifier.verifyAccountGenerationAuthHookConfig({
        projectRef: "abcdefghijklmnopqrst",
        accessToken: "token",
        fetchImpl: async () => jsonResponse({}, 500),
      }),
    ).rejects.toThrow("Supabase auth config request failed");

    await expect(
      verifier.verifyAccountGenerationAuthHookConfig({
        projectRef: "abcdefghijklmnopqrst",
        accessToken: "token",
        fetchImpl: async () =>
          jsonResponse({
            hook_before_user_created_enabled: false,
            hook_before_user_created_uri: null,
          }),
      }),
    ).rejects.toThrow("Before User Created Hook is disabled");

    await expect(
      verifier.verifyAccountGenerationAuthHookConfig({
        projectRef: "abcdefghijklmnopqrst",
        accessToken: "token",
        fetchImpl: async () =>
          jsonResponse({
            hook_before_user_created_enabled: true,
            hook_before_user_created_uri: "https://wrong.example.com/hook",
          }),
      }),
    ).rejects.toThrow("Before User Created Hook URI does not match the expected Postgres function");

    await expect(
      verifier.verifyAccountGenerationAuthHookConfig({
        projectRef: "abcdefghijklmnopqrst",
        accessToken: "token",
        fetchImpl: async () =>
          jsonResponse({
            hook: {
              before_user_created: {
                enabled: true,
                uri: EXPECTED_URI,
              },
            },
          }),
      }),
    ).rejects.toThrow("Supabase auth config payload is malformed");

    await expect(
      verifier.verifyAccountGenerationAuthHookConfig({
        projectRef: "abcdefghijklmnopqrst",
        accessToken: "token",
        fetchImpl: async () =>
          jsonResponse({
            hook_before_user_created_enabled: true,
            hook_before_user_created_uri: null,
          }),
      }),
    ).rejects.toThrow("Supabase auth config payload is malformed");
  });

  it("reuses the merged exact origin/master gate and keeps git/keychain/network injectable in the CLI", async () => {
    const cli = await import(
      "../scripts/verify-account-generation-auth-hook-config.mjs"
    );

    const writes: string[] = [];
    const spawnSyncImpl = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
      .mockReturnValueOnce({
        status: 0,
        stdout: "420177f57f4b19d3c4403393c27b5ecfe6fa3dd1\n",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "420177f57f4b19d3c4403393c27b5ecfe6fa3dd1\n",
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" });

    const exitCode = await cli.runAccountGenerationAuthHookConfigVerification({
      cwd: "/repo",
      env: {
        SUPABASE_ACCESS_TOKEN: "env-token",
      },
      fetchImpl: async () =>
        jsonResponse({
          hook_before_user_created_enabled: true,
          hook_before_user_created_uri: EXPECTED_URI,
          smtp_pass: "must-not-leak",
        }),
      spawnSyncImpl,
      resolveLinkedRoot: () => "/linked-root",
      stdout: { write: (chunk: string) => void writes.push(chunk) },
      stderr: { write: (chunk: string) => void writes.push(`stderr:${chunk}`) },
      platform: "linux",
      readFile: (filePath: string) => {
        expect(filePath).toBe("/linked-root/supabase/.temp/project-ref");
        return "abcdefghijklmnopqrst\n";
      },
      readKeychainSecret: () => {
        throw new Error("should not read keychain");
      },
    });

    expect(exitCode).toBe(0);
    expect(spawnSyncImpl).toHaveBeenNthCalledWith(
      1,
      "git",
      ["fetch", "--quiet", "origin", "master"],
      expect.objectContaining({ cwd: "/repo", encoding: "utf8" }),
    );
    expect(JSON.parse(writes.join(""))).toEqual({
      ok: true,
      readOnly: true,
      remoteWrites: 0,
      mergeSha: "420177f57f4b19d3c4403393c27b5ecfe6fa3dd1",
      authHookConfigured: true,
      beforeUserCreatedHook: {
        enabled: true,
        uriMatchesExpected: true,
      },
    });
  });

  it("uses the fixed /usr/bin/security path for keychain fallback", async () => {
    const cli = await import(
      "../scripts/verify-account-generation-auth-hook-config.mjs"
    );

    const execFileSyncImpl = vi.fn(() => "default:c3VwYWJhc2UtdG9rZW4");
    const secret = cli.readSupabaseCliKeychainSecret({
      execFileSyncImpl,
    });

    expect(secret).toBe("default:c3VwYWJhc2UtdG9rZW4");
    expect(execFileSyncImpl).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["find-generic-password", "-w", "-s", "Supabase CLI", "-a", "supabase"],
      { encoding: "utf8" },
    );
  });

  it("fails before keychain/network when exact origin/master is not satisfied and sanitizes stderr", async () => {
    const cli = await import(
      "../scripts/verify-account-generation-auth-hook-config.mjs"
    );

    const fetchImpl = vi.fn();
    const readKeychainSecret = vi.fn(() => "default:c3VwYWJhc2UtdG9rZW4");
    const resolveLinkedRoot = vi.fn(() => "/linked-root");
    const writes: string[] = [];
    const spawnSyncImpl = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
      .mockReturnValueOnce({
        status: 0,
        stdout: "420177f57f4b19d3c4403393c27b5ecfe6fa3dd1\n",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "1111111111111111111111111111111111111111\n",
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" });

    const exitCode = await cli.runAccountGenerationAuthHookConfigVerification({
      cwd: "/repo",
      env: {
        SUPABASE_ACCESS_TOKEN: "super-secret-token",
        SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      },
      fetchImpl,
      spawnSyncImpl,
      resolveLinkedRoot,
      stdout: { write: () => {} },
      stderr: { write: (chunk: string) => void writes.push(chunk) },
      platform: "darwin",
      readFile: () => "abcdefghijklmnopqrst",
      readKeychainSecret,
    });

    expect(exitCode).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readKeychainSecret).not.toHaveBeenCalled();
    expect(resolveLinkedRoot).not.toHaveBeenCalled();
    const stderr = writes.join("");
    expect(stderr).toContain("requires HEAD to equal origin/master");
    expect(stderr).not.toContain("abcdefghijklmnopqrst");
    expect(stderr).not.toContain("super-secret-token");
    expect(stderr).not.toContain("https://api.supabase.com");
  });

  it("does not leak project refs, tokens, URLs, or response bodies when the auth config request fails", async () => {
    const cli = await import(
      "../scripts/verify-account-generation-auth-hook-config.mjs"
    );

    const writes: string[] = [];
    const spawnSyncImpl = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
      .mockReturnValueOnce({
        status: 0,
        stdout: "420177f57f4b19d3c4403393c27b5ecfe6fa3dd1\n",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "420177f57f4b19d3c4403393c27b5ecfe6fa3dd1\n",
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" });

    const exitCode = await cli.runAccountGenerationAuthHookConfigVerification({
      cwd: "/repo",
      env: {
        SUPABASE_ACCESS_TOKEN: "super-secret-token",
      },
      fetchImpl: async () => ({
        status: 500,
        async json() {
          return {
            body: "raw-response-body",
            token: "super-secret-token",
            ref: "abcdefghijklmnopqrst",
            url: "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/config/auth",
          };
        },
      }),
      spawnSyncImpl,
      resolveLinkedRoot: () => "/linked-root",
      stdout: { write: () => {} },
      stderr: { write: (chunk: string) => void writes.push(chunk) },
      platform: "linux",
      readFile: (filePath: string) => {
        expect(filePath).toBe("/linked-root/supabase/.temp/project-ref");
        return "abcdefghijklmnopqrst";
      },
      readKeychainSecret: () => {
        throw new Error("should not read keychain");
      },
    });

    expect(exitCode).toBe(1);
    const stderr = writes.join("");
    expect(stderr).toContain("Supabase auth config request failed");
    expect(stderr).not.toContain("abcdefghijklmnopqrst");
    expect(stderr).not.toContain("super-secret-token");
    expect(stderr).not.toContain("raw-response-body");
    expect(stderr).not.toContain("https://api.supabase.com");
  });
});
