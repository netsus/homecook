import { beforeEach, describe, expect, it, vi } from "vitest";

import { isSameOriginPost } from "@/lib/server/full-local-auth/request";

describe("isSameOriginPost", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the configured public app origin behind a local proxy URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.mumeok.kr/app?ignored=1");

    const request = new Request("http://localhost:3100/auth/flow/start", {
      method: "POST",
      headers: {
        origin: "https://app.mumeok.kr",
      },
    });

    expect(isSameOriginPost(request)).toBe(true);
  });

  it("falls back to the request origin when NEXT_PUBLIC_APP_URL is missing", () => {
    const request = new Request("http://localhost:3100/auth/flow/start", {
      method: "POST",
      headers: {
        origin: "http://localhost:3100",
      },
    });

    expect(isSameOriginPost(request)).toBe(true);
  });

  it("falls back to the request origin when NEXT_PUBLIC_APP_URL is malformed", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not-a-url");

    const request = new Request("http://localhost:3100/auth/flow/start", {
      method: "POST",
      headers: {
        origin: "http://localhost:3100",
      },
    });

    expect(isSameOriginPost(request)).toBe(true);
  });

  it("rejects an evil origin even when forwarded headers spoof the public host", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.mumeok.kr");

    const request = new Request("http://localhost:3100/auth/flow/start", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "x-forwarded-host": "app.mumeok.kr",
        "x-forwarded-proto": "https",
      },
    });

    expect(isSameOriginPost(request)).toBe(false);
  });
});
