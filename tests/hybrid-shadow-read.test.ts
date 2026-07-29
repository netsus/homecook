import { describe, expect, it, vi } from "vitest";

import { createHybridShadowReadFetch } from "@/lib/server/hybrid-auth/shadow-read";

describe("hybrid local-shadow semantic reads", () => {
  it("compares canonical JSON digests but returns the remote response", async () => {
    const remoteFetch = vi.fn(async () =>
      Response.json([{ id: 1, nested: { b: 2, a: 1 } }]));
    const localFetch = vi.fn(async () =>
      Response.json([{ nested: { a: 1, b: 2 }, id: 1 }]));
    const record = vi.fn();
    const shadowFetch = createHybridShadowReadFetch({
      localDataUrl: "http://127.0.0.1:8000",
      localFetch,
      record,
      remoteFetch,
    });

    const response = await shadowFetch(
      "https://remote.example/rest/v1/recipes?select=id",
      {
        headers: { Authorization: "Bearer remote-user-jwt" },
        method: "GET",
      },
    );

    await expect(response.json()).resolves.toEqual([
      { id: 1, nested: { b: 2, a: 1 } },
    ]);
    expect(localFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/rest/v1/recipes?select=id",
      expect.objectContaining({ method: "GET" }),
    );
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      match: true,
      method: "GET",
      path: "/rest/v1/recipes",
      status: "compared",
    }));
  });

  it("never shadows writes or non-PostgREST reads", async () => {
    const remoteFetch = vi.fn(async () => Response.json({ remote: true }));
    const localFetch = vi.fn();
    const record = vi.fn();
    const shadowFetch = createHybridShadowReadFetch({
      localDataUrl: "http://127.0.0.1:8000",
      localFetch,
      record,
      remoteFetch,
    });

    await shadowFetch("https://remote.example/rest/v1/recipes", {
      method: "POST",
    });
    await shadowFetch("https://remote.example/auth/v1/user", {
      method: "GET",
    });
    await shadowFetch(
      "https://remote.example/rest/v1/rpc/private_operation",
      { method: "GET" },
    );

    expect(remoteFetch).toHaveBeenCalledTimes(3);
    expect(localFetch).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("records a local failure without changing the remote response", async () => {
    const remoteFetch = vi.fn(async () =>
      new Response('{"authority":"remote"}', {
        headers: { "content-type": "application/json" },
        status: 200,
      }));
    const record = vi.fn();
    const shadowFetch = createHybridShadowReadFetch({
      localDataUrl: "http://127.0.0.1:8000",
      localFetch: vi.fn(async () => {
        throw new Error("local unavailable");
      }),
      record,
      remoteFetch,
    });

    const response = await shadowFetch(
      "https://remote.example/rest/v1/recipes",
      { method: "GET" },
    );

    await expect(response.json()).resolves.toEqual({ authority: "remote" });
    expect(record).toHaveBeenCalledWith({
      match: false,
      method: "GET",
      path: "/rest/v1/recipes",
      status: "local-error",
    });
  });
});
