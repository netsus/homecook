import { createHash } from "node:crypto";

const MAX_SHADOW_BODY_BYTES = 2 * 1024 * 1024;

export interface HybridShadowReadEvent {
  local_digest?: string;
  local_status?: number;
  match: boolean;
  method: "GET";
  path: string;
  remote_digest?: string;
  remote_status?: number;
  status: "compared" | "local-error" | "skipped-too-large";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }

  return value;
}

async function semanticDigest(response: Response) {
  const body = await response.clone().text();
  if (Buffer.byteLength(body, "utf8") > MAX_SHADOW_BODY_BYTES) {
    return null;
  }

  let semanticBody: unknown = body;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") && body) {
    try {
      semanticBody = canonicalize(JSON.parse(body) as unknown);
    } catch {
      semanticBody = body;
    }
  }

  return createHash("sha256")
    .update(JSON.stringify({
      body: semanticBody,
      status: response.status,
    }))
    .digest("hex");
}

function isSafeShadowRead(request: Request) {
  if (request.method !== "GET") {
    return false;
  }

  const pathname = new URL(request.url).pathname;
  return pathname.startsWith("/rest/v1/")
    && !pathname.startsWith("/rest/v1/rpc/");
}

function defaultRecord(event: HybridShadowReadEvent) {
  console.warn(JSON.stringify({
    event: "homecook.hybrid_shadow_read",
    ...event,
  }));
}

export function createHybridShadowReadFetch({
  localDataUrl,
  localFetch,
  record = defaultRecord,
  remoteFetch = globalThis.fetch,
}: {
  localDataUrl: string;
  localFetch: typeof globalThis.fetch;
  record?: (event: HybridShadowReadEvent) => void;
  remoteFetch?: typeof globalThis.fetch;
}): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const remoteResponse = await remoteFetch(input, init);
    if (!isSafeShadowRead(request)) {
      return remoteResponse;
    }

    const remoteUrl = new URL(request.url);
    const localUrl = new URL(`${remoteUrl.pathname}${remoteUrl.search}`, localDataUrl);
    const path = remoteUrl.pathname;

    try {
      const localResponse = await localFetch(localUrl.toString(), {
        headers: request.headers,
        method: "GET",
      });
      const [remoteDigest, localDigest] = await Promise.all([
        semanticDigest(remoteResponse),
        semanticDigest(localResponse),
      ]);
      if (!remoteDigest || !localDigest) {
        record({
          match: false,
          method: "GET",
          path,
          status: "skipped-too-large",
        });
        return remoteResponse;
      }

      record({
        local_digest: localDigest,
        local_status: localResponse.status,
        match: remoteDigest === localDigest,
        method: "GET",
        path,
        remote_digest: remoteDigest,
        remote_status: remoteResponse.status,
        status: "compared",
      });
    } catch {
      record({
        match: false,
        method: "GET",
        path,
        status: "local-error",
      });
    }

    return remoteResponse;
  };
}
