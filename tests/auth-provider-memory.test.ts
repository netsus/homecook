// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  LAST_AUTH_PROVIDER_KEY,
  clearLastAuthProvider,
  readLastAuthProvider,
  syncLastAuthProviderFromCookie,
} from "@/lib/auth/provider-memory";

describe("provider memory", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = "homecook-last-auth-provider=; Path=/; Max-Age=0";
  });

  it("uses valid localStorage before a conflicting compatibility cookie", () => {
    localStorage.setItem(LAST_AUTH_PROVIDER_KEY, "google");
    document.cookie = "homecook-last-auth-provider=naver; Path=/";
    expect(readLastAuthProvider()).toBe("google");
  });

  it("migrates a valid cookie only when localStorage is absent", () => {
    document.cookie = "homecook-last-auth-provider=kakao; Path=/";
    expect(readLastAuthProvider()).toBe("kakao");
    expect(localStorage.getItem(LAST_AUTH_PROVIDER_KEY)).toBe("kakao");
  });

  it("removes invalid local and cookie values", () => {
    localStorage.setItem(LAST_AUTH_PROVIDER_KEY, "github");
    document.cookie = "homecook-last-auth-provider=invalid; Path=/";
    expect(readLastAuthProvider()).toBeNull();
    expect(localStorage.getItem(LAST_AUTH_PROVIDER_KEY)).toBeNull();
    expect(document.cookie).not.toContain("homecook-last-auth-provider=");
  });

  it("authenticated landing explicitly syncs a valid callback cookie", () => {
    localStorage.setItem(LAST_AUTH_PROVIDER_KEY, "google");
    document.cookie = "homecook-last-auth-provider=naver; Path=/";
    expect(syncLastAuthProviderFromCookie()).toBe("naver");
    expect(localStorage.getItem(LAST_AUTH_PROVIDER_KEY)).toBe("naver");
  });

  it("clears localStorage and the compatibility cookie together", () => {
    localStorage.setItem(LAST_AUTH_PROVIDER_KEY, "google");
    document.cookie = "homecook-last-auth-provider=google; Path=/";
    clearLastAuthProvider();
    expect(localStorage.getItem(LAST_AUTH_PROVIDER_KEY)).toBeNull();
    expect(document.cookie).not.toContain("homecook-last-auth-provider=");
  });
});
