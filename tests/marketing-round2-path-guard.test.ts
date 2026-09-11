import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "@/middleware";
const request = (path: string) => new NextRequest(`https://app.mumeok.kr${path}`);
describe("R2 raw path guard", () => {
  it("observes encoded segment before Next dynamic params decode", () => {
    expect(request("/beta/r2/%72ecording").nextUrl.pathname).toBe("/beta/r2/%72ecording");
  });
  it.each(["/beta/r2/%72ecording", "/beta/r2/RECORDING", "/beta/r2/homeflow/extra", "/beta/r2/recording%2f", "/beta/%72%32/recording", "/beta/r2", "/beta/r2/unknown"])("rejects noncanonical path %s", path => {
    const result = middleware(request(path));
    expect(result.status).toBe(404);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    expect(result.headers.get("x-middleware-next")).toBeNull();
  });
  it.each(["recording", "homeflow"])("allows the exact %s page", topic => {
    expect(middleware(request(`/beta/r2/${topic}`)).headers.get("x-middleware-next")).toBe("1");
  });
  it("canonicalizes only the valid trailing slash path", () => {
    const result = middleware(request("/beta/r2/recording/?utm_source=ig"));
    expect(result.status).toBe(308);
    expect(result.headers.get("location")).toBe("https://app.mumeok.kr/beta/r2/recording?utm_source=ig");
  });
  it.each(["/beta", "/beta?ad_variant=b", "/beta/legacy", "/recipes/123"])("keeps prior route %s untouched", path => {
    const result = middleware(request(path));
    expect(result.headers.get("x-middleware-next")).toBe("1");
    expect(result.headers.get("referrer-policy")).toBeNull();
  });
  it("runs only on the beta route family", () => { expect(config.matcher).toEqual(["/beta/:path*"]); });
});
