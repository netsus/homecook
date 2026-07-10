import { describe, expect, it } from "vitest";

import { resolveActualAuthProvider } from "@/lib/auth/provider-resolution";

const identities = [
  {
    provider: "google",
    last_sign_in_at: "2026-07-10T09:00:00.000Z",
    identity_data: { email_verified: true },
  },
  {
    provider: "custom:naver",
    last_sign_in_at: "2026-07-10T10:00:00.000Z",
    identity_data: { email_verified: true },
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

  it("rejects when another provider identity signed in more recently", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "google",
      cookieAttempt: "google",
      identities,
    })).toBeNull();
  });

  it("rejects when the latest sign-in time is tied across providers", () => {
    expect(resolveActualAuthProvider({
      queryAttempt: "google",
      cookieAttempt: "google",
      identities: [
        identities[0],
        {
          ...identities[1],
          last_sign_in_at: identities[0].last_sign_in_at,
        },
      ],
    })).toBeNull();
  });
});
