import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  closeStage4GuardedDataProxy,
  resolveStage4GuardedDataProxyTarget,
} from "../scripts/lib/cooking-meal-log-stage4-isolated.mjs";

const proxyUrl = "http://127.0.0.1:4313";
const rawDataUrl = "http://127.0.0.1:4314";
const storageUrl = "http://127.0.0.1:58101";

describe("cooking meal-log Stage 4 guarded Data prefix proxy", () => {
  it("routes an actual Supabase from URL to raw PostgREST without /rest/v1", async () => {
    const observed: string[] = [];
    const client = createClient(proxyUrl, "local-anon-key", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: async (input) => {
          const requestUrl = input instanceof Request ? input.url : String(input);
          observed.push(resolveStage4GuardedDataProxyTarget({
            dataUpstreamUrl: rawDataUrl,
            proxyUrl,
            requestUrl,
            storageUpstreamUrl: storageUrl,
          }));
          return new Response('[{"id":"owned-row"}]', {
            headers: { "content-type": "application/json" },
            status: 200,
          });
        },
      },
    });

    const result = await client.from("users").select("id").limit(1);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "owned-row" }]);
    expect(observed).toEqual([
      "http://127.0.0.1:4314/users?select=id&limit=1",
    ]);
  });

  it("routes an actual Supabase storage URL only to the isolated CLI gateway", async () => {
    const observed: string[] = [];
    const client = createClient(proxyUrl, "local-anon-key", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: async (input) => {
          const requestUrl = input instanceof Request ? input.url : String(input);
          observed.push(resolveStage4GuardedDataProxyTarget({
            dataUpstreamUrl: rawDataUrl,
            proxyUrl,
            requestUrl,
            storageUpstreamUrl: storageUrl,
          }));
          return new Response(Buffer.from([137, 80, 78, 71]), {
            headers: { "content-type": "image/png" },
            status: 200,
          });
        },
      },
    });

    const result = await client.storage
      .from("recipe-images")
      .download("owner/image.png");

    expect(result.error).toBeNull();
    expect(observed).toEqual([
      "http://127.0.0.1:58101/storage/v1/object/recipe-images/owner/image.png",
    ]);
  });

  it("rejects requests outside the exact proxy origin or allowlisted prefixes", () => {
    for (const requestUrl of [
      "http://127.0.0.1:4313/auth/v1/health",
      "http://127.0.0.1:4313/rest/v10/users",
      "http://127.0.0.1:4312/rest/v1/users",
    ]) {
      expect(() => resolveStage4GuardedDataProxyTarget({
        dataUpstreamUrl: rawDataUrl,
        proxyUrl,
        requestUrl,
        storageUpstreamUrl: storageUrl,
      })).toThrow(/proxy.*route|origin/iu);
    }
  });

  it("closes the proxy after success and treats repeated cleanup as complete", async () => {
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const server = { close, listening: true };

    await closeStage4GuardedDataProxy(server);
    server.listening = false;
    await closeStage4GuardedDataProxy(server);

    expect(close).toHaveBeenCalledTimes(1);
  });
});
