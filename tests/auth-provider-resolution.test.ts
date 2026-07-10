import { describe, expect, it } from "vitest";

import { resolveActualAuthProvider } from "@/lib/auth/provider-resolution";

const identities = [
  {
    provider: "google",
    last_sign_in_at: "2026-07-10T09:00:00.000Z",
    identity_data: { sub: "google-sub", email_verified: true },
  },
  {
    provider: "custom:naver",
    last_sign_in_at: "2026-07-10T10:00:00.000Z",
    identity_data: { sub: "naver-sub", email_verified: true },
  },
];

describe("actual auth provider resolution", () => {
  it("rejects conflicting query and cookie attempts", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "google",
      cookieAttempt: "naver",
      identities,
    })).toBeNull();
  });

  it("requires a verified attempt instead of app_metadata.provider", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: null,
      cookieAttempt: null,
      identities,
    })).toBeNull();
  });

  it("matches custom identity ids to their canonical attempted provider", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "naver",
      cookieAttempt: null,
      identities,
    })).toBe("naver");
  });

  it("rejects an attempt that has no matching identity", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "kakao",
      cookieAttempt: "kakao",
      identities,
    })).toBeNull();
  });

  it("rejects ambiguous duplicate identities without unique recent sign-in evidence", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "google",
      cookieAttempt: "google",
      identities: [
        identities[0],
        { ...identities[0] },
      ],
    })).toBeNull();
  });

  it("accepts the uniquely most recent matching identity", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "google",
      cookieAttempt: "google",
      identities: [
        identities[0],
        {
          ...identities[0],
          last_sign_in_at: "2026-07-10T08:00:00.000Z",
        },
      ],
    })).toBe("google");
  });

  it("accepts the attempted identity when another provider has a newer timestamp", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "google",
      cookieAttempt: "google",
      userMetadata: { sub: "google-sub" },
      identities,
    })).toBe("google");
  });

  it("accepts the attempted identity when another provider has the same timestamp", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "google",
      cookieAttempt: "google",
      userMetadata: { sub: "google-sub" },
      identities: [
        identities[0],
        {
          ...identities[1],
          last_sign_in_at: identities[0].last_sign_in_at,
        },
      ],
    })).toBe("google");
  });

  it("accepts the attempted identity when another provider has no timestamp", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "naver",
      cookieAttempt: "naver",
      userMetadata: { sub: "naver-sub" },
      identities: [
        identities[1],
        {
          provider: "kakao",
          identity_data: { sub: "kakao-sub", email_verified: true },
        },
      ],
    })).toBe("naver");
  });

  it("rejects a spoofed attempt when the current OAuth subject matches another identity", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "google",
      cookieAttempt: "google",
      userMetadata: { sub: "kakao-sub" },
      identities: [
        {
          provider: "google",
          last_sign_in_at: "2026-07-10T10:00:00.000Z",
          identity_data: { sub: "google-sub", email_verified: true },
        },
        {
          provider: "kakao",
          last_sign_in_at: "2026-07-10T09:00:00.000Z",
          identity_data: { sub: "kakao-sub", email_verified: true },
        },
      ],
    })).toBeNull();
  });
});
